from __future__ import annotations

import json
import base64
import re
import secrets
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlencode
from xml.etree import ElementTree as ET

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from .config import Settings

LTI = "https://purl.imsglobal.org/spec/lti/claim/"
DL = "https://purl.imsglobal.org/spec/lti-dl/claim/"
BO = "https://purl.imsglobal.org/spec/lti-bo/"
SCOPE = BO + "scope/basicoutcome"
XML_NS = "http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0"


def performance_identity(sourcedid: str) -> str:
    """Read the platform's headerless result payload after verifying its outer launch JWT.

    The platform adds a new iat every launch, so the complete opaque token is not an
    attempt identity. The platform still receives that complete token unchanged.
    Its inner MAC belongs to the platform; the tool authenticates the enclosing launch.
    """
    if len(sourcedid) > 16384 or not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", sourcedid):
        raise ValueError("Invalid platform result identifier")
    encoded = sourcedid.split(".")[0]
    try:
        value = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        pid = value["pid"]
        if type(pid) not in (int, str) or not str(pid).isascii() or not str(pid).isdigit() or int(pid) <= 0:
            raise ValueError("Invalid Performance ID")
        return str(int(pid))
    except (ValueError, KeyError, TypeError) as error:
        raise ValueError("Invalid platform result identifier") from error


def generate_key(path: Path) -> None:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    data = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                             serialization.NoEncryption())
    path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents accidental key rotation and loss of existing registrations.
    import os
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise ValueError("LTI signing key already exists; choose a new path to create another key") from None
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(data)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("LTI service redirects are not allowed")


class Transport:
    def request(self, url: str, body: bytes | None = None, headers: dict | None = None) -> bytes:
        request = urllib.request.Request(url, data=body, headers=headers or {})
        try:
            with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
                data = response.read(1024 * 1024 + 1)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise ValueError("The learning platform could not be reached; please retry") from error
        if len(data) > 1024 * 1024:
            raise ValueError("LTI service response is too large")
        return data


class Protocol:
    def __init__(self, settings: Settings, transport: Transport | None = None):
        self.settings = settings
        self.transport = transport or Transport()
        key = serialization.load_pem_private_key(settings.private_key_file.read_bytes(), password=None)
        if not isinstance(key, rsa.RSAPrivateKey) or key.key_size < 2048:
            raise ValueError("LTI requires an RSA private key of at least 2048 bits")
        self.private_key = key
        self.public_key = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
        self.public_key.update(kid=settings.key_id, alg="RS256", use="sig")
        self.keys: dict = {}
        self.keys_until = 0.0

    def verify(self, token: str, nonce: str) -> dict:
        header = jwt.get_unverified_header(token)
        if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
            raise ValueError("Invalid launch signing algorithm or key ID")
        if time.time() > self.keys_until or header["kid"] not in self.keys:
            data = json.loads(self.transport.request(self.settings.platform_url("jwk")))
            self.keys = {key.key_id: key.key for key in jwt.PyJWKSet.from_dict(data).keys
                         if key.algorithm_name == "RS256"}
            self.keys_until = time.time() + 300
        if header["kid"] not in self.keys:
            raise ValueError("Unknown platform signing key")
        claims = jwt.decode(token, self.keys[header["kid"]], algorithms=["RS256"],
                            audience=self.settings.client_id, issuer=self.settings.platform_issuer,
                            options={"require": ["iss", "aud", "sub", "iat", "exp", "nonce"],
                                     "verify_sub": False}, leeway=10)
        # Some platform registrations emit a numeric subject. Preserve its stable identity.
        if not isinstance(claims["sub"], (int, str)) or isinstance(claims["sub"], bool) or not str(claims["sub"]):
            raise ValueError("Invalid learner identity")
        audiences = claims["aud"] if isinstance(claims["aud"], list) else [claims["aud"]]
        if ((len(audiences) > 1 and claims.get("azp") != self.settings.client_id)
                or ("azp" in claims and claims["azp"] != self.settings.client_id)):
            raise ValueError("Invalid authorized party")
        if not isinstance(claims["nonce"], str) or not secrets.compare_digest(claims["nonce"], nonce):
            raise ValueError("Invalid launch nonce")
        if (claims.get(LTI + "version") != "1.3.0"
                or claims.get(LTI + "deployment_id") != self.settings.deployment_id
                or claims["exp"] - claims["iat"] > 300):
            raise ValueError("Invalid LTI version, deployment or launch lifetime")
        return claims

    def sign(self, claims: dict) -> str:
        now = int(time.time())
        return jwt.encode({"iat": now, "exp": now + 60, "jti": secrets.token_urlsafe(24), **claims},
                          self.private_key, algorithm="RS256", headers={"kid": self.settings.key_id})

    def selection(self, session: dict, item: dict, kind: str) -> dict:
        settings = self.settings
        claims = {
            "iss": settings.client_id, "aud": settings.platform_issuer,
            LTI + "message_type": "LtiDeepLinkingResponse", LTI + "version": "1.3.0",
            LTI + "deployment_id": settings.deployment_id,
            DL + "content_items": [{"type": "ltiResourceLink", "title": item["title"],
                                     "text": item["description"],
                                     "url": settings.tool_url + "/lti/resource?" + urlencode({"item": item["id"], "view": kind}),
                                     "custom": {"davinci_item": item["id"], "davinci_kind": kind}}],
        }
        if session.get("data") is not None:
            claims[DL + "data"] = session["data"]
        return {"action": session["return_url"], "jwt": self.sign(claims)}

    def report(self, attempt: dict) -> None:
        settings = self.settings
        # The current connection validates aud against its issuer, rather than its token URL.
        assertion = self.sign({"iss": settings.client_id, "sub": settings.client_id,
                               "aud": settings.platform_issuer})
        body = urlencode({"grant_type": "client_credentials", "scope": SCOPE,
                          "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                          "client_assertion": assertion}).encode()
        result = json.loads(self.transport.request(settings.platform_url("oauth2_token"), body,
                                                   {"Content-Type": "application/x-www-form-urlencoded"}))
        if not isinstance(result, dict) or not isinstance(result.get("scope"), str):
            raise ValueError("Invalid platform access token response")
        token = result.get("access_token")
        if not isinstance(token, str) or not token or SCOPE not in result.get("scope", "").split():
            raise ValueError("The learning platform did not grant result reporting access")
        envelope = ET.Element("imsx_POXEnvelopeRequest", xmlns=XML_NS)
        header = ET.SubElement(ET.SubElement(envelope, "imsx_POXHeader"), "imsx_POXRequestHeaderInfo")
        ET.SubElement(header, "imsx_version").text = "V1.0"
        ET.SubElement(header, "imsx_messageIdentifier").text = attempt["result"]["id"]
        record = ET.SubElement(ET.SubElement(ET.SubElement(envelope, "imsx_POXBody"), "replaceResultRequest"), "resultRecord")
        ET.SubElement(ET.SubElement(record, "sourcedGUID"), "sourcedId").text = attempt["sourcedid"]
        score = ET.SubElement(ET.SubElement(record, "result"), "resultScore")
        ET.SubElement(score, "language").text = "en"
        ET.SubElement(score, "textString").text = str(attempt["result"]["score"])
        extra = ET.SubElement(record, "blossom_extra")
        ET.SubElement(extra, "completion_state").text = attempt["result"]["completion"]
        ET.SubElement(extra, "performance_time").text = str(attempt["result"]["seconds"])
        response = self.transport.request(settings.check_callback(attempt["outcome_url"], "basic_outcome"),
                                          ET.tostring(envelope, encoding="utf-8", xml_declaration=True),
                                          {"Content-Type": "application/xml", "Authorization": "Bearer " + token})
        if b"<!DOCTYPE" in response.upper() or b"<!ENTITY" in response.upper():
            raise ValueError("Invalid platform result response")
        try:
            tree = ET.fromstring(response)
        except ET.ParseError as error:
            raise ValueError("Invalid platform result response") from error
        if tree.findtext(".//{*}imsx_codeMajor") != "success":
            raise ValueError("The learning platform did not accept the result; please retry")
