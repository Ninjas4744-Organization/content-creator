"""Platform LTI protocol round trips and security boundary tests; no real LMS writes."""
from __future__ import annotations

import json
import base64
import re
import tempfile
import time
import unittest
from dataclasses import asdict, replace
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlsplit
from xml.etree import ElementTree as ET

try:
    import jwt
    from cryptography.hazmat.primitives.asymmetric import rsa
    from davinci_creator.lti.app import create_app
    from davinci_creator.lti.config import Settings
    from davinci_creator.lti.protocol import BO, DL, LTI, SCOPE, generate_key
except ImportError:
    jwt = None


class Platform:
    def __init__(self, signing_key):
        self.key = signing_key
        self.tool_key = None
        self.reports = []
        self.token_requests = 0
        self.reject = False

    def request(self, url, body=None, headers=None):
        if url.endswith("/jwk"):
            public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key()))
            return json.dumps({"keys": [{**public, "kid": "platform", "alg": "RS256"}]}).encode()
        if url.endswith("/oauth2_token"):
            self.token_requests += 1
            fields = parse_qs(body.decode())
            assertion = jwt.decode(fields["client_assertion"][0], self.tool_key, algorithms=["RS256"],
                                   issuer="davinci", audience="https://platform.example/lms")
            assert assertion["sub"] == "davinci" and assertion["jti"]
            assert fields["scope"] == [SCOPE]
            return json.dumps({"access_token": "mock-service-token", "scope": SCOPE}).encode()
        if "/basic_outcome?" in url:
            assert headers["Authorization"] == "Bearer mock-service-token"
            self.reports.append(ET.fromstring(body))
            code = "failure" if self.reject else "success"
            return f'<imsx_POXEnvelopeResponse xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0"><imsx_POXHeader><imsx_POXResponseHeaderInfo><imsx_statusInfo><imsx_codeMajor>{code}</imsx_codeMajor></imsx_statusInfo></imsx_POXResponseHeaderInfo></imsx_POXHeader></imsx_POXEnvelopeResponse>'.encode()
        raise AssertionError("Unexpected outbound LTI request")


def sourcedid(pid=42, issued=1_700_000_000):
    payload = base64.urlsafe_b64encode(json.dumps({"pid": pid, "iat": issued}).encode()).decode().rstrip("=")
    return payload + ".mock-signature"


@unittest.skipIf(jwt is None, "Install optional LTI dependencies: pip install -e '.[lti]'")
class LtiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.platform_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        site = root / "site"
        (site / "library").mkdir(parents=True)
        (site / "index.html").write_text("library")
        (site / "deck.html").write_text("deck")
        (site / "video.html").write_text("video")
        (site / "library/catalog.json").write_text(json.dumps([{
            "id": "demo", "title": "שיעור", "description": "תיאור", "deck": "deck.html",
            "video": "video.html", "duration": 20,
        }]))
        self.source = root / "projects/demo/content.json"
        self.source.parent.mkdir(parents=True)
        self.source.write_text(json.dumps({"version": 1, "title": "שיעור", "scenes": [
            {"id": "one", "layout": "cover", "title": "אחד"},
            {"id": "two", "layout": "cover", "title": "שניים",
             "quiz": {"question": "מה בוחרים?", "options": ["נכון", "לא נכון"], "correct": 0}},
        ]}))
        key = root / "private.pem"
        generate_key(key)
        self.settings = Settings("https://library.example", "https://platform.example/lms", "davinci",
                                 key, root / "state.sqlite3", site, root, outcome_extension="platform_result")
        self.platform = Platform(self.platform_key)
        self.app = create_app(self.settings, transport=self.platform)
        self.app.testing = True
        self.client = self.app.test_client()
        self.platform.tool_key = self.app.extensions["lti"]["protocol"].private_key.public_key()

    def begin(self, kind="deck", selection=False):
        target = self.settings.tool_url + "/lti/resource"
        if not selection:
            target += "?" + urlencode({"item": "demo", "view": kind})
        response = self.client.get("/lti/login", query_string={
            "iss": self.settings.platform_issuer, "client_id": "davinci", "login_hint": "learner",
            "lti_message_hint": "opaque-platform-hint", "target_link_uri": target, "lti_deployment_id": "na",
        })
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        auth = json.loads(re.search(r'location.replace\(("[^"]*")\)', html)[1])
        fields = parse_qs(urlsplit(auth).query)
        binding = json.loads(re.search(r"flow\.'\+\"[^\"]+\",(\"[^\"]+\")", html)[1])
        self.assertEqual(fields["lti_message_hint"], ["opaque-platform-hint"])
        now = int(time.time())
        claims = {
            "iss": self.settings.platform_issuer, "aud": "davinci", "sub": 123,
            "iat": now, "exp": now + 120, "nonce": fields["nonce"][0],
            LTI + "version": "1.3.0", LTI + "deployment_id": "na", LTI + "target_link_uri": target,
            LTI + "message_type": "LtiDeepLinkingRequest" if selection else "LtiResourceLinkRequest",
            LTI + "resource_link": {"id": "assignment-1"},
            LTI + "roles": ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"],
            BO + "claim/basicoutcome": {"lis_result_sourcedid": sourcedid(),
                                       "lis_outcome_service_url": self.settings.platform_url("basic_outcome") + "?tp_id=7"},
            DL + "deep_linking_settings": {"accept_types": ["ltiResourceLink"], "data": "opaque-selection-data",
                                          "deep_link_return_url": self.settings.platform_url("lti_deep_linking_response") + "?tp_id=7"},
        }
        return fields["state"][0], binding, claims

    def launch(self, flow):
        state, binding, claims = flow
        token = jwt.encode(claims, self.platform_key, algorithm="RS256", headers={"kid": "platform"})
        return self.client.post("/lti/launch", data={"state": state, "id_token": token})

    def exchange(self, flow, response):
        ticket = json.loads(re.search(r'ticket:("[^"]+")', response.get_data(as_text=True))[1])
        response = self.client.post("/lti/exchange", json={"ticket": ticket, "binding": flow[1]},
                                    headers={"Origin": self.settings.tool_url})
        self.assertEqual(response.status_code, 200)
        return response.json["token"]

    def open(self, kind="deck", selection=False):
        flow = self.begin(kind, selection)
        response = self.launch(flow)
        self.assertEqual(response.status_code, 200)
        return self.exchange(flow, response)

    def api(self, path, token, data=None):
        headers = {"Authorization": "Bearer " + token, "Origin": self.settings.tool_url}
        return self.client.get("/lti/" + path, headers=headers) if data is None else self.client.post("/lti/" + path, json=data, headers=headers)

    def finish_deck(self, token, answer=0):
        for index in (0, 1):
            self.assertEqual(self.api("progress", token, {"event": "slide", "index": index}).status_code, 200)
        self.assertEqual(self.api("answer", token, {"question": "two", "option": answer}).status_code, 200)

    def test_instructor_selects_one_lesson_and_response_is_signed_for_platform(self):
        token = self.open(selection=True)
        self.assertEqual(self.api("session", token).json, {"mode": "select"})
        response = self.api("select", token, {"item": "demo", "kind": "video"})
        self.assertEqual(response.status_code, 200)
        data = jwt.decode(response.json["jwt"], self.platform.tool_key, algorithms=["RS256"],
                          issuer="davinci", audience=self.settings.platform_issuer)
        self.assertEqual(data[DL + "data"], "opaque-selection-data")
        self.assertEqual(len(data[DL + "content_items"]), 1)
        self.assertIn("item=demo&view=video", data[DL + "content_items"][0]["url"])
        self.assertEqual(response.json["action"], self.settings.platform_url("lti_deep_linking_response") + "?tp_id=7")

    def test_score_completion_and_idempotent_reporting(self):
        token = self.open()
        self.assertNotIn("correct", self.api("session", token).get_data(as_text=True))
        self.finish_deck(token)
        response = self.api("complete", token, {"score": 0})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["reported"])
        self.assertEqual(response.json["result"]["score"], 1)
        xml = self.platform.reports[0]
        self.assertEqual(xml.findtext(".//{*}sourcedId"), sourcedid())
        self.assertEqual(xml.findtext(".//{*}textString"), "1.0")
        self.assertEqual(xml.findtext(".//{*}completion_state"), "Yes")
        self.assertEqual(self.api("complete", token, {}).status_code, 200)
        self.assertEqual(len(self.platform.reports), 1)

    def test_standard_outcomes_work_without_an_optional_extension(self):
        self.settings = replace(self.settings, outcome_extension="")
        self.app = create_app(self.settings, transport=self.platform)
        self.client = self.app.test_client()
        token = self.open()
        self.finish_deck(token)
        self.assertEqual(self.api("complete", token, {}).status_code, 200)
        record = self.platform.reports[0]
        self.assertEqual(record.findtext(".//{*}textString"), "1.0")
        self.assertIsNone(record.find(".//{*}completion_state"))
        with self.assertRaisesRegex(ValueError, "extension"):
            replace(self.settings, outcome_extension="invalid:element")
        self.assertEqual(self.api("answer", token, {"question": "two", "option": 1}).status_code, 400)

    def test_wrong_answer_reports_failure_and_ignores_forged_score(self):
        token = self.open()
        self.finish_deck(token, answer=1)
        response = self.api("complete", token, {"score": 1, "completion": "Yes"})
        self.assertEqual(response.json["result"]["score"], 0)
        self.assertEqual(self.platform.reports[0].findtext(".//{*}completion_state"), "Scorm_fail")

    def test_failed_report_is_frozen_and_can_be_retried(self):
        token = self.open()
        self.finish_deck(token)
        self.platform.reject = True
        self.assertEqual(self.api("complete", token, {}).status_code, 502)
        first = self.api("session", token).json
        self.assertIsNotNone(first["result"])
        self.assertFalse(first["reported"])
        self.platform.reject = False
        second = self.api("complete", token, {})
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first["result"], second.json["result"])

    def test_progress_survives_relaunch_and_service_restart(self):
        token = self.open()
        self.finish_deck(token)
        self.client = create_app(self.settings, transport=self.platform).test_client()
        flow = self.begin()
        flow[2][BO + "claim/basicoutcome"]["lis_result_sourcedid"] = sourcedid(issued=int(time.time()) + 60)
        resumed = self.exchange(flow, self.launch(flow))
        self.assertTrue(self.api("session", resumed).json["ready"])
        self.assertEqual(self.api("session", resumed).json["answers"], {"two": 0})
        self.api("complete", resumed, {})
        self.assertEqual(self.platform.reports[0].findtext(".//{*}sourcedId"), flow[2][BO + "claim/basicoutcome"]["lis_result_sourcedid"])

    def test_new_performance_starts_with_no_progress(self):
        token = self.open()
        self.finish_deck(token)
        flow = self.begin()
        flow[2][BO + "claim/basicoutcome"]["lis_result_sourcedid"] = sourcedid(pid=43)
        fresh = self.exchange(flow, self.launch(flow))
        self.assertEqual(self.api("session", fresh).json["progress"], 0)
        self.assertEqual(self.api("session", fresh).json["answers"], {})

    def test_incomplete_lesson_or_missing_answers_cannot_be_submitted(self):
        token = self.open()
        self.assertEqual(self.api("complete", token, {}).status_code, 400)
        self.api("progress", token, {"event": "slide", "index": 0})
        self.api("progress", token, {"event": "slide", "index": 1})
        self.assertEqual(self.api("complete", token, {}).status_code, 400)
        self.assertEqual(self.platform.reports, [])

    def test_rejects_tampered_claims_and_replayed_launch(self):
        for claim, value in (("aud", "another-tool"), ("iss", "https://evil.example"), ("nonce", "wrong"),
                             (LTI + "deployment_id", "wrong"), ("exp", int(time.time()) - 60)):
            with self.subTest(claim=claim):
                flow = self.begin()
                flow[2][claim] = value
                self.assertEqual(self.launch(flow).status_code, 400)
        flow = self.begin()
        self.assertEqual(self.launch(flow).status_code, 200)
        self.assertEqual(self.launch(flow).status_code, 400)
        flow = self.begin()
        other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        forged = jwt.encode(flow[2], other_key, algorithm="RS256", headers={"kid": "platform"})
        self.assertEqual(self.client.post("/lti/launch", data={"state": flow[0], "id_token": forged}).status_code, 400)

    def test_browser_binding_is_required_and_exchange_is_one_use(self):
        flow = self.begin()
        response = self.launch(flow)
        ticket = json.loads(re.search(r'ticket:("[^"]+")', response.get_data(as_text=True))[1])
        data = {"ticket": ticket, "binding": "another-browser"}
        self.assertEqual(self.client.post("/lti/exchange", json=data, headers={"Origin": self.settings.tool_url}).status_code, 400)
        self.exchange(flow, response)
        self.assertEqual(self.client.post("/lti/exchange", json={"ticket": ticket, "binding": flow[1]}, headers={"Origin": self.settings.tool_url}).status_code, 400)

    def test_student_cannot_select_content_or_use_an_instructor_session_to_report(self):
        flow = self.begin(selection=True)
        flow[2][LTI + "roles"] = ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"]
        self.assertEqual(self.launch(flow).status_code, 400)
        self.assertEqual(self.api("complete", self.open(selection=True), {}).status_code, 400)
        self.assertEqual(self.api("select", self.open(), {"item": "demo", "kind": "deck"}).status_code, 400)

    def test_rejects_untrusted_callbacks_and_lesson_paths(self):
        for selection, claim, key in ((False, BO + "claim/basicoutcome", "lis_outcome_service_url"),
                                       (True, DL + "deep_linking_settings", "deep_link_return_url")):
            flow = self.begin(selection=selection)
            flow[2][claim][key] = "https://evil.example/steal?tp_id=7"
            self.assertEqual(self.launch(flow).status_code, 400)
        token = self.open(selection=True)
        self.assertEqual(self.api("select", token, {"item": "../../private", "kind": "deck"}).status_code, 400)
        self.assertEqual(self.client.get("/../private.pem").status_code, 404)
        self.assertEqual(self.client.get("/.env").status_code, 404)
        self.assertEqual(self.client.get("/lti/session").status_code, 400)

    def test_video_requires_real_viewing_coverage_and_does_not_count_seeking(self):
        token = self.open(kind="video")
        now = time.time()
        for offset, position in ((0, 0), (1, 19), (2, 0)):
            with patch("davinci_creator.lti.app.time.time", return_value=now + offset):
                response = self.api("progress", token, {"event": "video", "position": position, "rate": 1, "playing": True})
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.json["ready"])
        for offset, position in ((7, 5), (12, 10), (17, 15), (22, 20)):
            with patch("davinci_creator.lti.app.time.time", return_value=now + offset):
                response = self.api("progress", token, {"event": "video", "position": position, "rate": 1, "playing": True})
        self.assertTrue(response.json["ready"])
        self.api("answer", token, {"question": "two", "option": 0})
        self.assertEqual(self.api("complete", token, {}).status_code, 200)

    def test_invalid_progress_and_cross_origin_writes_are_rejected(self):
        token = self.open()
        for data in ({"event": "slide", "index": True}, {"event": "slide", "index": 1000},
                     {"event": "video", "position": 20, "rate": 1, "playing": True}):
            self.assertEqual(self.api("progress", token, data).status_code, 400)
        self.assertEqual(self.client.post("/lti/complete", json={}, headers={"Origin": "https://evil.example", "Authorization": "Bearer " + token}).status_code, 400)

    def test_repeated_instant_video_events_do_not_fabricate_coverage(self):
        token = self.open(kind="video")
        now = time.time()
        with patch("davinci_creator.lti.app.time.time", return_value=now):
            for position in range(21):
                response = self.api("progress", token, {"event": "video", "position": position, "rate": 1, "playing": True})
        self.assertFalse(response.json["ready"])
        self.assertLessEqual(response.json["progress"], .05)

    def test_question_snapshot_and_session_expiry(self):
        token = self.open()
        doc = json.loads(self.source.read_text())
        doc["scenes"][1]["quiz"]["correct"] = 1
        self.source.write_text(json.dumps(doc))
        self.finish_deck(token, answer=0)
        self.assertEqual(self.api("complete", token, {}).json["result"]["score"], 1)
        with patch("davinci_creator.lti.app.time.time", return_value=time.time() + self.settings.session_seconds + 30):
            self.assertEqual(self.api("session", token).status_code, 400)

    def test_static_video_ranges_and_private_symlinks(self):
        media = self.settings.site_dir / "video.mp4"
        media.write_bytes(b"0123456789")
        response = self.client.get("/video.mp4", headers={"Range": "bytes=2-5"})
        self.addCleanup(response.close)
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.data, b"2345")
        (self.settings.site_dir / "escaped.txt").symlink_to(self.settings.private_key_file)
        self.assertEqual(self.client.get("/escaped.txt").status_code, 404)

    def test_public_library_and_shared_lessons_need_no_lms_session(self):
        for path in ("/", "/library/catalog.json", "/deck.html", "/video.html"):
            with self.client.get(path) as response:
                self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/lti/resource").location, "/")
        response = self.client.get("/lti/resource?item=demo&view=deck")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.location, "/?item=demo&view=deck")
        with self.client.get(response.location) as public:
            self.assertEqual(public.status_code, 200)
        self.assertEqual(self.platform.reports, [])

    def test_preview_is_explicit_and_no_quiz_lesson_completes(self):
        flow = self.begin()
        del flow[2][BO + "claim/basicoutcome"]
        token = self.exchange(flow, self.launch(flow))
        self.assertFalse(self.api("session", token).json["reporting"])
        self.finish_deck(token)
        self.assertEqual(self.api("complete", token, {}).status_code, 400)
        doc = json.loads(self.source.read_text())
        del doc["scenes"][1]["quiz"]
        self.source.write_text(json.dumps(doc))
        token = self.open()
        for index in (0, 1):
            self.api("progress", token, {"event": "slide", "index": index})
        self.assertEqual(self.api("complete", token, {}).json["result"]["score"], 1)

    def test_public_key_contains_no_private_material_and_config_rejects_public_secrets(self):
        public = self.client.get("/lti/jwks")
        self.assertEqual(public.json["keys"][0]["kid"], "davinci-lti-1")
        self.assertNotIn("d", public.json["keys"][0])
        with self.assertRaises(ValueError):
            Settings("https://library.example", "https://platform.example/lms", "davinci",
                     self.settings.site_dir / "private.pem", self.settings.database_file,
                     self.settings.site_dir, self.settings.source_root)

    def test_private_platform_profile_supplies_only_installation_settings(self):
        root = self.settings.source_root
        values = asdict(self.settings)
        del values["outcome_extension"]
        for name in ("private_key_file", "database_file", "site_dir", "source_root"):
            values[name] = str(values[name])
        config = root / "test-config.json"
        config.write_text(json.dumps(values))
        (root / "lti.platform.local.json").write_text(json.dumps({
            "platform_issuer": "https://other.example", "outcome_extension": "platform_result",
            "unrelated": "ignored",
        }))
        loaded = Settings.load(config)
        self.assertEqual(loaded.platform_issuer, self.settings.platform_issuer)
        self.assertEqual(loaded.outcome_extension, "platform_result")


if __name__ == "__main__":
    unittest.main()
