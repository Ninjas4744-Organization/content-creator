import hashlib
import base64
import json
import os
from pathlib import Path
import stat
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "creator-kit/scripts"))
import creator_auth as auth

SITE = "https://creator.example"
TOKEN = "dv1." + "a" * 64 + "." + "b" * 43


class CreatorAuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "private" / "auth.json"
        self.environment = patch.dict(os.environ, {"DAVINCI_AUTH_FILE": str(self.path)})
        self.environment.start()

    def tearDown(self):
        self.environment.stop()
        self.temp.cleanup()

    def value(self):
        return {"access_token": TOKEN, "expires_at": int(time.time()) + 3600, "email": "creator@example.com"}

    def test_cache_is_private_and_existing_sessions_need_no_browser(self):
        auth.save(SITE, self.value())
        self.assertEqual(stat.S_IMODE(self.path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.path.parent.stat().st_mode), 0o700)
        with patch.object(auth, "request", return_value={"kind": "agent"}), patch.object(auth, "browser_login") as browser:
            self.assertEqual(auth.credentials(SITE), TOKEN)
            browser.assert_not_called()
        self.path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "private"):
            auth.load(SITE)

    def test_revocation_requires_new_browser_approval_and_never_reuses_the_old_file(self):
        auth.save(SITE, self.value())
        def login(_site):
            self.assertFalse(self.path.exists())
            return "new-approved-credential"
        with patch.object(auth, "request", side_effect=HTTPError(SITE, 401, "revoked", {}, None)), patch.object(auth, "browser_login", side_effect=login):
            self.assertEqual(auth.credentials(SITE), "new-approved-credential")

    def test_loopback_callback_rejects_wrong_state_and_host_then_exchanges_code_with_verifier(self):
        captured = {}
        failures = []
        def open_browser(url, **_kwargs):
            query = parse_qs(urlsplit(url).query)
            captured.update({key: value[0] for key, value in query.items()})
            def callback():
                try:
                    endpoint = captured["redirect_uri"]
                    for request in [Request(endpoint + "?" + urlencode({"code": "c" * 43, "state": "wrong"})), Request(endpoint + "?" + urlencode({"code": "c" * 43, "state": captured["state"]}), headers={"Host": "untrusted.example"})]:
                        try:
                            urlopen(request, timeout=3)
                            failures.append("Invalid callback was accepted")
                        except HTTPError as error:
                            self.assertEqual(error.code, 400)
                    with urlopen(endpoint + "?" + urlencode({"code": "c" * 43, "state": captured["state"]}), timeout=3) as response:
                        self.assertEqual(response.status, 200)
                        self.assertNotIn("c" * 43, response.read().decode())
                except Exception as error:
                    failures.append(str(error))
            captured["thread"] = threading.Thread(target=callback)
            captured["thread"].start()
            return True
        def exchange(site, path, data=None, token=None):
            self.assertEqual((site, path), (SITE, "/admin/auth/agent/token"))
            self.assertEqual(data["code"], "c" * 43)
            self.assertEqual(data["redirect_uri"], captured["redirect_uri"])
            expected = base64.urlsafe_b64encode(hashlib.sha256(data["code_verifier"].encode()).digest()).rstrip(b"=").decode()
            self.assertEqual(expected, captured["code_challenge"])
            return {**self.value(), "token_type": "Bearer", "scope": "creator"}
        with patch.object(auth.webbrowser, "open", side_effect=open_browser), patch.object(auth, "request", side_effect=exchange):
            self.assertEqual(auth.browser_login(SITE, timeout=5), TOKEN)
        captured["thread"].join(timeout=3)
        self.assertEqual(failures, [])
        self.assertEqual(auth.load(SITE)["access_token"], TOKEN)

    def test_failed_exchange_never_saves_a_credential_and_redirects_are_not_followed(self):
        # Redirecting an authenticated request to another origin is always refused.
        self.assertIsNone(auth.NoRedirect().redirect_request(None, None, 302, "", {}, "https://untrusted.example"))
        with patch.object(auth.webbrowser, "open", return_value=True):
            with self.assertRaisesRegex(ValueError, "timed out"):
                auth.browser_login(SITE, timeout=0)
        self.assertFalse(self.path.exists())

    def test_logout_revokes_remotely_and_removes_local_credentials_without_logging_in(self):
        auth.save(SITE, self.value())
        with patch.object(auth, "request", return_value={"disconnected": True}) as request:
            self.assertEqual(auth.disconnect(SITE), {"disconnected": True, "remote_revoked": True})
            self.assertEqual(request.call_args.args, (SITE, "/admin/auth/agent/logout", {}, TOKEN))
        self.assertFalse(self.path.exists())
        with patch.object(auth, "request") as request:
            self.assertEqual(auth.disconnect(SITE), {"disconnected": True, "remote_revoked": False})
            request.assert_not_called()

    def test_untrusted_cache_files_and_insecure_site_are_rejected(self):
        self.path.parent.mkdir(mode=0o700)
        outside = Path(self.temp.name) / "outside.json"
        outside.write_text(json.dumps({"site": SITE, **self.value()}))
        outside.chmod(0o600)
        self.path.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "private"):
            auth.load(SITE)
        with self.assertRaisesRegex(ValueError, "symlink"):
            auth.save(SITE, self.value())
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            auth.credentials("http://creator.example")


if __name__ == "__main__":
    unittest.main()
