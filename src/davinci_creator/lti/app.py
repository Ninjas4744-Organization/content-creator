from __future__ import annotations

import json
import math
import re
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import jwt
from flask import Flask, Response, jsonify, redirect, render_template_string, request, send_from_directory

from ..common import load
from .config import Settings
from .protocol import BO, DL, LTI, Protocol, Transport, performance_identity
from .store import Store, digest


class Catalog:
    def __init__(self, settings: Settings):
        self.settings = settings
        data = json.loads((settings.site_dir / "library/catalog.json").read_text(encoding="utf-8"))
        self.items = {item["id"]: item for item in data}
        if len(self.items) != len(data):
            raise ValueError("Duplicate catalog lesson IDs")

    def lesson(self, item_id: str, kind: str) -> tuple[dict, dict]:
        if not isinstance(item_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", item_id):
            raise ValueError("Invalid lesson ID")
        item = self.items.get(item_id)
        if not item or kind not in {"deck", "video"} or not item.get(kind):
            raise ValueError("Lesson format is not available")
        media = (self.settings.site_dir / item[kind]).resolve()
        if not media.is_relative_to(self.settings.site_dir.resolve()) or not media.is_file():
            raise ValueError("Lesson media is missing")
        sources = [self.settings.source_root / folder / item_id / "content.json" for folder in ("examples", "projects")]
        sources = [source for source in sources if source.is_file()]
        if len(sources) != 1 or not sources[0].resolve().is_relative_to(self.settings.source_root.resolve()):
            raise ValueError("Lesson source is missing or ambiguous")
        return item, load(sources[0])


PAGE = """<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>דה וינצ׳י · למידה</title>
<style>body{background:#08152b;color:#fafcff;font:18px Arial,sans-serif;max-width:700px;margin:12vh auto;padding:24px;line-height:1.8}a{color:#a9d8f6}</style>
<p id="status" role="status">פותחים את השיעור…</p><script nonce="{{ nonce }}">{{ script|safe }}</script></html>"""


def create_app(settings: Settings | None = None, *, transport: Transport | None = None) -> Flask:
    settings = settings or Settings.load()
    app = Flask(__name__, static_folder=None)
    app.config.update(MAX_CONTENT_LENGTH=128 * 1024)
    store = Store(settings.database_file)
    protocol = Protocol(settings, transport)
    catalog = Catalog(settings)
    app.extensions["lti"] = {"store": store, "protocol": protocol, "settings": settings}
    platform_origin = urlsplit(settings.platform_issuer)
    frame_origin = f"{platform_origin.scheme}://{platform_origin.netloc}"

    @app.after_request
    def headers(response: Response) -> Response:
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Only the configured platform and our own media may frame the tool.
        if request.path.startswith("/lti/"):
            response.headers["Cache-Control"] = "no-store"
            nonce = getattr(request, "lti_nonce", "")
            response.headers["Content-Security-Policy"] = (
                f"default-src 'none'; script-src 'nonce-{nonce}'; style-src 'unsafe-inline'; "
                f"connect-src 'self'; frame-ancestors 'self' {frame_origin}; base-uri 'none'; form-action {frame_origin}"
            )
        else:
            response.headers["Content-Security-Policy"] = f"frame-ancestors 'self' {frame_origin}; base-uri 'self'"
        return response

    def page(script: str) -> str:
        request.lti_nonce = secrets.token_urlsafe(18)
        return render_template_string(PAGE, nonce=request.lti_nonce, script=script)

    def js(value) -> str:
        return json.dumps(value, ensure_ascii=False).replace("<", "\\u003c")

    def session(mode: str | None = None) -> dict:
        token = request.headers.get("Authorization", "").removeprefix("Bearer ")
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            raise ValueError("Launch this lesson from your course")
        if request.method == "POST" and request.headers.get("Origin") != settings.tool_url:
            raise ValueError("Invalid request origin")
        value = store.get("session", digest(token))
        if mode and value["mode"] != mode:
            raise ValueError("This operation is not allowed for this launch")
        return value

    def payload() -> dict:
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise ValueError("Expected a JSON object")
        return value

    def public_attempt(attempt: dict) -> dict:
        if attempt["kind"] == "deck":
            fraction = len(attempt["viewed"]) / attempt["slides"]
        else:
            fraction = min(1, sum(end - start for start, end in attempt["watched"]) / attempt["duration"])
        return {
            "itemId": attempt["item"], "kind": attempt["kind"], "reporting": bool(attempt["sourcedid"]),
            "questions": [{"id": q["id"], "question": q["question"], "options": q["options"]} for q in attempt["questions"]],
            "answers": attempt["answers"], "progress": round(fraction, 4),
            "ready": fraction >= (1 if attempt["kind"] == "deck" else .9),
            "result": attempt["result"], "reported": attempt["reported"],
        }

    @app.route("/lti/login", methods=["GET", "POST"])
    def login():
        args = request.values
        if args.get("iss") != settings.platform_issuer or args.get("client_id", settings.client_id) != settings.client_id:
            raise ValueError("Unknown LTI platform registration")
        if args.get("lti_deployment_id", settings.deployment_id) != settings.deployment_id:
            raise ValueError("Unknown LTI deployment")
        target = args.get("target_link_uri", "")
        settings.resource(target)
        if not args.get("login_hint") or not args.get("lti_message_hint"):
            raise ValueError("Missing LTI login parameters")
        state, nonce, binding = (secrets.token_urlsafe(32) for _ in range(3))
        store.put("flow", state, {"nonce": nonce, "binding": digest(binding), "target": target}, 300)
        auth = settings.platform_url("auth") + "?" + urlencode({
            "scope": "openid", "response_type": "id_token", "response_mode": "form_post", "prompt": "none",
            "client_id": settings.client_id, "redirect_uri": settings.tool_url + "/lti/launch",
            "login_hint": args["login_hint"], "lti_message_hint": args["lti_message_hint"],
            "state": state, "nonce": nonce,
        })
        # A per-flow browser secret prevents login CSRF even when third-party cookies are blocked.
        return page(f"""try{{sessionStorage.setItem('davinci.lti.flow.'+{js(state)},{js(binding)});
location.replace({js(auth)});}}catch{{document.querySelector('#status').textContent='הדפדפן חסם את האחסון הדרוש לפתיחת השיעור. פנו למנהל הקורס כדי לפתוח אותו בחלון נפרד.';}}""")

    @app.post("/lti/launch")
    def launch():
        state = request.form.get("state", "")
        flow = store.get("flow", state)
        claims = protocol.verify(request.form.get("id_token", ""), flow["nonce"])
        if claims.get(LTI + "target_link_uri") != flow["target"]:
            raise ValueError("Lesson launch target does not match the login request")
        message = claims.get(LTI + "message_type")
        if message == "LtiDeepLinkingRequest":
            roles = claims.get(LTI + "roles", [])
            allowed = {f"http://purl.imsglobal.org/vocab/lis/v2/membership#{role}" for role in ("Instructor", "Administrator", "ContentDeveloper")}
            allowed |= {role.replace("http:", "https:") for role in allowed}
            deep = claims.get(DL + "deep_linking_settings", {})
            if (not isinstance(deep, dict) or not isinstance(roles, list)
                    or any(not isinstance(role, str) for role in roles)
                    or not allowed.intersection(roles) or "ltiResourceLink" not in deep.get("accept_types", [])):
                raise ValueError("This launch cannot select course content")
            value = {"mode": "select", "return_url": settings.check_callback(deep.get("deep_link_return_url", ""), "lti_deep_linking_response"),
                     "data": deep.get("data")}
        elif message == "LtiResourceLinkRequest":
            item_id, kind = settings.resource(flow["target"])
            item, doc = catalog.lesson(item_id, kind)
            resource = claims.get(LTI + "resource_link", {})
            if not isinstance(resource, dict) or type(resource.get("id")) not in (int, str) or not resource["id"]:
                raise ValueError("Missing LTI resource link")
            outcome = claims.get(BO + "claim/basicoutcome", {})
            if not isinstance(outcome, dict):
                raise ValueError("Invalid outcome claim")
            sourcedid = outcome.get("lis_result_sourcedid", "")
            outcome_url = settings.check_callback(outcome["lis_outcome_service_url"], "basic_outcome") if sourcedid else ""
            if not isinstance(sourcedid, str):
                raise ValueError("Invalid outcome identifier")
            identity = [settings.platform_issuer, settings.client_id, settings.deployment_id,
                        str(claims["sub"]), str(resource["id"]), performance_identity(sourcedid) if sourcedid else "preview"]
            attempt_id = digest(json.dumps(identity))
            attempt = {
                "item": item_id, "kind": kind, "slides": len(doc["scenes"]), "duration": item.get("duration"),
                "questions": [{"id": scene["id"], **scene["quiz"]} for scene in doc["scenes"] if scene.get("quiz")],
                "answers": {}, "viewed": [], "watched": [], "last_video": None, "playback_wall": 0,
                "sourcedid": sourcedid, "outcome_url": outcome_url, "created": time.time(),
                "result": None, "reported": False, "report_lock": 0,
            }
            if kind == "video" and (not isinstance(attempt["duration"], (int, float)) or attempt["duration"] <= 0):
                raise ValueError("Video duration is missing from the catalog")
            existing = store.ensure(attempt_id, attempt, settings.retention_days * 86400)
            if (existing["item"], existing["kind"]) != (item_id, kind):
                raise ValueError("This Performance is already bound to another lesson")
            # Retain progress but use the latest opaque token for this Performance's reporting.
            store.change("attempt", attempt_id, lambda current: current.update(sourcedid=sourcedid, outcome_url=outcome_url))
            value = {"mode": "activity", "attempt": attempt_id}
        else:
            raise ValueError("Unsupported LTI message")
        store.get("flow", state, consume=True)
        ticket = secrets.token_urlsafe(32)
        store.put("exchange", digest(ticket), {"binding": flow["binding"], "session": value}, 120)
        return page(f"""(async()=>{{try{{
const binding=sessionStorage.getItem('davinci.lti.flow.'+{js(state)});
if(!binding)throw new Error();
const response=await fetch('/lti/exchange',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{ticket:{js(ticket)},binding}})}});
if(!response.ok)throw new Error();const data=await response.json();
sessionStorage.removeItem('davinci.lti.flow.'+{js(state)});
sessionStorage.setItem('davinci.lti.session.'+data.id,data.token);location.replace('/?lti='+encodeURIComponent(data.id));
}}catch{{document.querySelector('#status').textContent='לא ניתן לפתוח את השיעור. חזרו לקורס ופתחו אותו שוב.';}}}})();""")

    @app.post("/lti/exchange")
    def exchange():
        if request.headers.get("Origin") != settings.tool_url:
            raise ValueError("Invalid request origin")
        data = payload()
        ticket, binding = data.get("ticket"), data.get("binding")
        if not isinstance(ticket, str) or not isinstance(binding, str):
            raise ValueError("Invalid launch exchange")
        value = store.get("exchange", digest(ticket))
        if not secrets.compare_digest(value["binding"], digest(binding)):
            raise ValueError("Launch belongs to another browser session")
        store.get("exchange", digest(ticket), consume=True)
        token, identifier = secrets.token_urlsafe(32), secrets.token_urlsafe(12)
        store.put("session", digest(token), value["session"], settings.session_seconds)
        return jsonify(token=token, id=identifier)

    @app.get("/lti/session")
    def get_session():
        value = session()
        if value["mode"] == "select":
            return jsonify(mode="select")
        return jsonify(mode="activity", **public_attempt(store.get("attempt", value["attempt"])))

    @app.post("/lti/select")
    def select():
        value, data = session("select"), payload()
        item, _ = catalog.lesson(data.get("item"), data.get("kind"))
        return jsonify(protocol.selection(value, item, data["kind"]))

    @app.post("/lti/progress")
    def progress():
        value, data = session("activity"), payload()

        def update(attempt: dict) -> None:
            if attempt["result"]:
                return
            if attempt["kind"] == "deck" and data.get("event") == "slide":
                index = data.get("index")
                if type(index) is not int or not 0 <= index < attempt["slides"]:
                    raise ValueError("Invalid slide index")
                attempt["viewed"] = sorted(set(attempt["viewed"]) | {index})
            elif attempt["kind"] == "video" and data.get("event") == "video":
                position, rate = data.get("position"), data.get("rate")
                if (type(position) not in (int, float) or not math.isfinite(position)
                        or not 0 <= position <= attempt["duration"] + 1
                        or type(rate) not in (int, float) or not .5 <= rate <= 2
                        or type(data.get("playing")) is not bool):
                    raise ValueError("Invalid video progress")
                now, previous = time.time(), attempt["last_video"]
                if previous and previous["playing"]:
                    elapsed, delta = now - previous["at"], position - previous["position"]
                    attempt["playback_wall"] += max(0, min(10, elapsed))
                    # Seeking does not count as viewing. Bound credit by real elapsed time and playback rate.
                    if 0 < delta <= min(15, elapsed * max(rate, previous["rate"]) + 1):
                        intervals = sorted(attempt["watched"] + [[previous["position"], min(position, attempt["duration"]) ]])
                        merged: list[list[float]] = []
                        for start, end in intervals:
                            if merged and start <= merged[-1][1] + .05:
                                merged[-1][1] = max(end, merged[-1][1])
                            else:
                                merged.append([start, end])
                        if sum(end - start for start, end in merged) <= attempt["playback_wall"] * 2 + 1:
                            attempt["watched"] = merged
                attempt["last_video"] = {"at": now, "position": position, "rate": rate, "playing": data["playing"]}
            else:
                raise ValueError("Progress does not match this lesson format")

        return jsonify(**public_attempt(store.change("attempt", value["attempt"], update)))

    @app.post("/lti/answer")
    def answer():
        value, data = session("activity"), payload()

        def update(attempt: dict) -> None:
            if attempt["result"]:
                raise ValueError("This Performance has already been submitted")
            question = next((q for q in attempt["questions"] if q["id"] == data.get("question")), None)
            option = data.get("option")
            if not question or type(option) is not int or not 0 <= option < len(question["options"]):
                raise ValueError("Invalid question or answer")
            attempt["answers"][question["id"]] = option

        return jsonify(**public_attempt(store.change("attempt", value["attempt"], update)))

    @app.post("/lti/complete")
    def complete():
        value = session("activity")
        lock_id = secrets.token_urlsafe(16)

        def prepare(attempt: dict) -> None:
            if attempt["reported"]:
                return
            if not attempt["sourcedid"]:
                raise ValueError("Result reporting is not enabled for this lesson in the LMS")
            if not public_attempt(attempt)["ready"] or len(attempt["answers"]) != len(attempt["questions"]):
                raise ValueError("Finish the lesson and answer all questions before submitting")
            if attempt["report_lock"] > time.time():
                raise ValueError("A result submission is in progress; please retry shortly")
            if not attempt["result"]:
                questions = attempt["questions"]
                score = round(sum(attempt["answers"][q["id"]] == q["correct"] for q in questions) / len(questions), 4) if questions else 1.0
                attempt["result"] = {"id": secrets.token_urlsafe(24), "score": score,
                                     "completion": "Yes" if score >= settings.pass_score else "Scorm_fail",
                                     "seconds": int(attempt["playback_wall"] if attempt["kind"] == "video" else min(settings.session_seconds, time.time() - attempt["created"]))}
            attempt.update(report_lock=time.time() + 90, report_owner=lock_id)

        attempt = store.change("attempt", value["attempt"], prepare)
        if not attempt["reported"]:
            try:
                protocol.report(attempt)
            except (ValueError, jwt.PyJWTError, TypeError, KeyError):
                def release(current: dict) -> None:
                    if current.get("report_owner") == lock_id:
                        current["report_lock"] = 0
                store.change("attempt", value["attempt"], release)
                return jsonify(error="report_failed", message="הדיווח לא הגיע לקורס. התוצאה נשמרה ואפשר לנסות שוב."), 502

            def sent(current: dict) -> None:
                if current.get("report_owner") == lock_id:
                    current.update(reported=True, report_lock=0)
            attempt = store.change("attempt", value["attempt"], sent)
        return jsonify(**public_attempt(attempt))

    @app.get("/lti/jwks")
    def jwks():
        return jsonify(keys=[protocol.public_key])

    @app.get("/lti/resource")
    def resource():
        item_id, kind = settings.resource(settings.tool_url + request.full_path.rstrip("?"))
        if item_id is None:
            return redirect("/")
        catalog.lesson(item_id, kind)
        return redirect("/?" + urlencode({"item": item_id, "view": kind}))

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    @app.get("/", defaults={"path": "index.html"})
    @app.get("/<path:path>")
    def static_site(path: str):
        candidate = (settings.site_dir / path).resolve()
        if (not candidate.is_relative_to(settings.site_dir.resolve()) or not candidate.is_file()
                or any(part.startswith(".") for part in Path(path).parts)):
            return "Not found", 404
        return send_from_directory(settings.site_dir, path)

    def invalid(error):
        # Never echo incoming tokens, platform data or internal exception text to the browser/log.
        return jsonify(error="invalid_request", message="לא ניתן להשלים את הפעולה. פתחו את השיעור שוב מתוך הקורס, או פנו למנהל הקורס."), 400

    for exception in (ValueError, jwt.PyJWTError, KeyError, TypeError):
        app.register_error_handler(exception, invalid)
    return app
