"""Loopback-only LTI platform emulator for browser QA; do not use as a production LMS."""
from __future__ import annotations

import argparse
import json
import secrets
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import jwt
from flask import Flask, jsonify, redirect, render_template_string, request
from werkzeug.serving import make_server

from davinci_creator.lti.app import create_app
from davinci_creator.lti.config import Settings
from davinci_creator.lti.protocol import BO, DL, LTI, SCOPE, generate_key


def demo(tool_port: int, platform_port: int) -> None:
    if tool_port == platform_port:
        raise ValueError("Use different tool and platform ports")
    tool = f"http://127.0.0.1:{tool_port}"
    origin = f"http://127.0.0.1:{platform_port}"
    issuer = origin + "/lms"
    platform = Flask("lti-platform-demo")
    platform.logger.disabled = True
    hints, selections, reports = {}, [], []
    performance_counter = 0
    form = """<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>LTI platform demo</title>
    <style>body{font:18px Arial;background:#08152b;color:white;padding:32px;line-height:2}a{color:#a9d8f6}button{padding:12px}</style>{{ body|safe }}</html>"""
    auto = """<form method="post" action="{{ action }}">{% for name,value in fields.items() %}<input type="hidden" name="{{ name }}" value="{{ value }}">{% endfor %}<button>המשך</button></form><script>document.querySelector('form').submit()</script>"""
    with tempfile.TemporaryDirectory(prefix="davinci-lti-demo-") as directory:
        root = Path(directory)
        key = root / "tool.private.pem"
        generate_key(key)
        settings = Settings(tool, issuer, "davinci-demo", key, root / "state.sqlite3",
                            ROOT / "projects/learning-library/output/site", ROOT, allow_local_http=True)
        tool_app = create_app(settings)
        protocol = tool_app.extensions["lti"]["protocol"]
        # Separate tool/platform RSA pairs make signature checks representative.
        from cryptography.hazmat.primitives.asymmetric import rsa
        platform_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(platform_key.public_key()))
        catalog = json.loads((settings.site_dir / "library/catalog.json").read_text())

        @platform.get("/")
        def home():
            body = '<h1>LTI · local integration test</h1><a href="/start?select=1">בחירת שיעור לקורס</a> · <a href="/embedded">בדיקה בתוך מסגרת הקורס</a><h2>הפעלת שיעור כלומד</h2>'
            for item in sorted(catalog, key=lambda entry: entry["slides"]):
                for kind, label in (("deck", "מצגת"), ("video", "סרטון")):
                    if item.get(kind):
                        from markupsafe import escape
                        href = "/start?" + urlencode({"item": item["id"], "view": kind})
                        body += f'<p><a href="{escape(href)}">{escape(item["title"])} · {label}</a></p>'
            body += f'<p>Selections: {len(selections)} · Reported results: {len(reports)}</p>'
            for report in reports:
                body += f'<p>Score: {report["score"]} · Completion: {report["completion"]}</p>'
            return render_template_string(form, body=body)

        @platform.get("/embedded")
        def embedded():
            return '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>Course demo</title><body style="margin:0;background:#08152b"><iframe title="תוכן הקורס" src="/start?select=1" style="width:100%;height:100vh;border:0"></iframe></body></html>'

        @platform.get("/start")
        def start():
            nonlocal performance_counter
            performance_counter += 1
            target = tool + "/lti/resource"
            selection = request.args.get("select") == "1"
            if not selection:
                target += "?" + urlencode({"item": request.args["item"], "view": request.args["view"]})
            hint = secrets.token_urlsafe(24)
            hints[hint] = {"target": target, "selection": selection, "performance": performance_counter}
            fields = {"iss": issuer, "client_id": "davinci-demo", "login_hint": "demo-learner",
                      "lti_deployment_id": "na", "lti_message_hint": hint, "target_link_uri": target}
            return redirect(tool + "/lti/login?" + urlencode(fields))

        @platform.get("/lms/WebServices/lti13/auth")
        def auth():
            args = request.args
            hint = hints[args["lti_message_hint"]]
            now = int(time.time())
            claims = {"iss": issuer, "aud": "davinci-demo", "sub": "demo-learner", "iat": now, "exp": now + 120,
                      "nonce": args["nonce"], LTI + "version": "1.3.0", LTI + "deployment_id": "na",
                      LTI + "target_link_uri": hint["target"], LTI + "resource_link": {"id": "demo-assignment"},
                      LTI + "roles": ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor" if hint["selection"] else "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
                      LTI + "message_type": "LtiDeepLinkingRequest" if hint["selection"] else "LtiResourceLinkRequest",
                      DL + "deep_linking_settings": {"accept_types": ["ltiResourceLink"], "deep_link_return_url": issuer + "/WebServices/lti13/lti_deep_linking_response?tp_id=7"},
                      BO + "claim/basicoutcome": {"lis_result_sourcedid": jwt.encode({"pid": hint["performance"], "iat": now}, "demo-result-key-32-characters-long", algorithm="HS256").split(".", 1)[1], "lis_outcome_service_url": issuer + "/WebServices/lti13/basic_outcome?tp_id=7"}}
            encoded = jwt.encode(claims, platform_key, algorithm="RS256", headers={"kid": "demo-platform"})
            return render_template_string(auto, action=tool + "/lti/launch", fields={"state": args["state"], "id_token": encoded})

        @platform.get("/lms/WebServices/lti13/jwk")
        def jwk():
            return jsonify(keys=[{**public, "kid": "demo-platform", "alg": "RS256", "use": "sig"}])

        @platform.post("/lms/WebServices/lti13/oauth2_token")
        def oauth():
            jwt.decode(request.form["client_assertion"], protocol.private_key.public_key(), algorithms=["RS256"],
                       issuer="davinci-demo", audience=issuer)
            if request.form["scope"] != SCOPE:
                return jsonify(error="scope"), 400
            return jsonify(access_token="loopback-demo-only", scope=SCOPE, token_type="Bearer", expires_in=3600)

        @platform.post("/lms/WebServices/lti13/basic_outcome")
        def outcome():
            if request.headers.get("Authorization") != "Bearer loopback-demo-only":
                return "Unauthorized", 401
            xml = ET.fromstring(request.data)
            reports.append({"score": xml.findtext(".//{*}textString"), "completion": xml.findtext(".//{*}completion_state")})
            return '<imsx_POXEnvelopeResponse xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0"><imsx_POXHeader><imsx_POXResponseHeaderInfo><imsx_statusInfo><imsx_codeMajor>success</imsx_codeMajor></imsx_statusInfo></imsx_POXResponseHeaderInfo></imsx_POXHeader></imsx_POXEnvelopeResponse>', 200, {"Content-Type": "application/xml"}

        @platform.post("/lms/WebServices/lti13/lti_deep_linking_response")
        def selected():
            claims = jwt.decode(request.form["JWT"], protocol.private_key.public_key(), algorithms=["RS256"],
                                issuer="davinci-demo", audience=issuer)
            item = claims[DL + "content_items"][0]
            selections.append(item)
            query = parse_qs(urlsplit(item["url"]).query)
            href = "/start?" + urlencode({"item": query["item"][0], "view": query["view"][0]})
            from markupsafe import escape
            return render_template_string(form, body=f'<h1>בחירת השיעור הצליחה</h1><p>{escape(item["title"])}</p><a href="{escape(href)}">פתיחת השיעור כלומד</a> · <a href="/">לתפריט הבדיקה</a>')

        servers = [make_server("127.0.0.1", tool_port, tool_app, threaded=True),
                   make_server("127.0.0.1", platform_port, platform, threaded=True)]
        for server in servers:
            threading.Thread(target=server.serve_forever, daemon=True).start()
        print(f"Local LTI platform demo: {origin} (Ctrl+C to stop)", flush=True)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            for server in servers:
                server.shutdown()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tool-port", type=int, default=8765)
    parser.add_argument("--platform-port", type=int, default=8766)
    args = parser.parse_args()
    demo(args.tool_port, args.platform_port)
