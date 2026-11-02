"""Browser approval and PKCE login for the creator API; credentials stay on this computer."""
from __future__ import annotations

import base64
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import webbrowser

TOKEN = re.compile(r"dv1\.[a-f0-9]{64}\.[A-Za-z0-9_-]{43}")
USER_AGENT = "DaVinciCreator/1.0"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def auth_path():
    return Path(os.environ.get("DAVINCI_AUTH_FILE", str(Path.home() / ".davinci-creator" / "auth.json"))).expanduser()


def load(site):
    path = auth_path()
    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or (os.name != "nt" and (info.st_mode & 0o077 or info.st_uid != os.getuid())):
            raise ValueError("The local login file must be a private regular file (permissions 0600).")
        if info.st_size > 4096:
            raise ValueError("Invalid local login file; reconnect using creator_agent.py connect.")
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or value.get("site") != site or not isinstance(value.get("access_token"), str) or not TOKEN.fullmatch(value["access_token"]) or not isinstance(value.get("expires_at"), int):
            raise ValueError("Invalid local login file; reconnect using creator_agent.py connect.")
        return value
    except FileNotFoundError:
        return None


def forget():
    auth_path().unlink(missing_ok=True)


def save(site, value):
    path = auth_path()
    if path.is_symlink() or path.parent.is_symlink():
        raise ValueError("The login file cannot be stored through a symlink.")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if os.name != "nt" and (path.parent.stat().st_uid != os.getuid() or path.parent.stat().st_mode & 0o077):
        raise ValueError("The login directory must be private (permissions 0700).")
    descriptor, temporary = tempfile.mkstemp(prefix=".auth-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump({"site": site, **value}, stream)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def request(site, path, data=None, token=None):
    headers = {"Origin": site, "User-Agent": USER_AGENT, "Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = Request(site + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
    with build_opener(NoRedirect()).open(req, timeout=30) as response:
        if not response.headers.get("Content-Type", "").startswith("application/json"):
            raise ValueError("The site's creator login is unavailable; contact the site maintainer.")
        raw = response.read(8193)
        if len(raw) > 8192:
            raise ValueError("Invalid login response.")
        return json.loads(raw)


def browser_login(site, timeout=300):
    verifier = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(32)
    result = {}

    class Callback(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Never log the one-use callback code or state.

        def do_GET(self):
            parsed = urlsplit(self.path)
            query = parse_qs(parsed.query)
            code = query.get("code", [])
            valid = self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}" and parsed.path == "/callback" and query.get("state") == [state] and len(code) == 1 and re.fullmatch(r"[A-Za-z0-9_-]{43}", code[0])
            message = "האישור התקבל. אפשר לחזור לסוכן ה־AI." if valid else "בקשת חיבור אינה תקינה. חזרו לחלון ההתחברות המקורי."
            body = ("<!doctype html><html lang='he' dir='rtl'><meta charset='utf-8'><title>דה וינצ׳י 4744</title><p>" + message + "</p></html>").encode()
            self.send_response(200 if valid else 400)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)
            if valid:
                result["code"] = code[0]

    with HTTPServer(("127.0.0.1", 0), Callback) as server:
        server.timeout = 1
        callback = f"http://127.0.0.1:{server.server_port}/callback"
        url = site + "/admin/auth/agent/authorize?" + urlencode({"redirect_uri": callback, "code_challenge": challenge, "code_challenge_method": "S256", "state": state})
        print("Sign in with your learning-platform account and approve this AI agent in the browser.", file=sys.stderr)
        print("Authorization page: " + url, file=sys.stderr)
        webbrowser.open(url, new=2)
        deadline = time.monotonic() + timeout
        while not result and time.monotonic() < deadline:
            server.handle_request()
        if not result:
            raise ValueError("Login timed out. Run creator_agent.py connect and finish browser approval.")
    value = request(site, "/admin/auth/agent/token", {"code": result["code"], "code_verifier": verifier, "redirect_uri": callback})
    if not isinstance(value, dict) or value.get("token_type") != "Bearer" or value.get("scope") != "creator" or not isinstance(value.get("access_token"), str) or not TOKEN.fullmatch(value["access_token"]) or not isinstance(value.get("account", value.get("email")), str) or not isinstance(value.get("expires_at"), int) or not time.time() < value["expires_at"] <= time.time() + 31 * 86400:
        raise ValueError("Invalid login response; no credential was saved.")
    save(site, {"access_token": value["access_token"], "expires_at": value["expires_at"], "account": value.get("account", value.get("email"))})
    return value["access_token"]


def credentials(site):
    if urlsplit(site).scheme != "https":
        raise ValueError("Creator authentication requires HTTPS.")
    try:
        value = load(site)
        if value and value["expires_at"] > time.time() + 60:
            try:
                identity = request(site, "/admin/auth/session", token=value["access_token"])
                if not isinstance(identity, dict) or identity.get("kind") != "agent":
                    raise ValueError("Invalid creator session.")
                return value["access_token"]
            except HTTPError as error:
                if error.code != 401:
                    raise
        forget()
        return browser_login(site)
    except (HTTPError, URLError):
        raise ValueError("Creator login failed or is unavailable. Finish sign-in in the browser and retry; contact the maintainer if access is denied.") from None


def disconnect(site):
    value = load(site)
    revoked = False
    try:
        if value:
            try:
                request(site, "/admin/auth/agent/logout", {}, value["access_token"])
                revoked = True
            except HTTPError as error:
                if error.code != 401:
                    raise
                revoked = True
    except (HTTPError, URLError):
        pass
    finally:
        forget()
    return {"disconnected": True, "remote_revoked": revoked}
