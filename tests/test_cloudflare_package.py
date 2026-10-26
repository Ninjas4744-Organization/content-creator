import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("prepare_cloudflare", ROOT / "scripts/prepare_cloudflare.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class CloudflarePackageTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {"PLATFORM_ISSUER": "", "OUTCOME_EXTENSION": "", "LTI_PLATFORM_CONFIG": ""})
        environment.start()
        self.addCleanup(environment.stop)

    def test_assessment_module_stays_outside_public_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            library = root / "projects/learning-library"
            site = library / "output/site"
            (site / "library").mkdir(parents=True)
            (site / "index.html").write_text("public library")
            source = root / "projects/demo/content.json"
            source.parent.mkdir(parents=True)
            source.write_text(json.dumps({"version": 1, "title": "Demo", "scenes": [
                {"id": "one", "layout": "cover", "title": "One", "quiz": {"question": "Pick", "options": ["A", "B"], "correct": 1}},
            ]}))
            (site / "library/catalog.json").write_text(json.dumps([{
                "id": "demo", "title": "Demo", "description": "Test", "slides": 1,
                "duration": None, "deck": "deck.html", "video": None,
            }]))
            (site / "example.mp4").write_bytes(b"test media")
            (library / "lti.platform.local.json").write_text(json.dumps({"platform_issuer": "https://platform.example/lms"}))
            package.prepare(library, root)
            bank = json.loads((library / "output/cloudflare-data/lessons.json").read_text())
            self.assertEqual(bank["demo"]["questions"][0]["correct"], 1)
            public = library / "output/cloudflare-assets"
            self.assertEqual((public / "index.html").read_text(), "public library")
            self.assertFalse((public / "lessons.json").exists())
            self.assertIn("frame-ancestors 'self' https://platform.example;", (public / "_headers").read_text())
            self.assertFalse((public / "lti.platform.local.json").exists())
            self.assertEqual(json.loads((library / "output/cloudflare-data/media.json").read_text()), {"/example.mp4": 10})
            self.assertNotIn('"correct"', "".join(path.read_text() for path in public.rglob("*.json")))

    def test_oversized_assets_fail_before_a_deployment_can_start(self):
        with tempfile.TemporaryDirectory() as directory:
            library = Path(directory)
            site = library / "output/site"
            site.mkdir(parents=True)
            (site / "index.html").write_text("public")
            with (site / "large.mp4").open("wb") as stream:
                stream.truncate(25 * 1024 * 1024 + 1)
            with self.assertRaisesRegex(ValueError, "25 MiB"):
                package.prepare(library, library)

    def test_private_files_and_directory_symlinks_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            library = Path(directory)
            site = library / "output/site"
            site.mkdir(parents=True)
            (site / "index.html").write_text("public")
            (site / "signing.private.pem").write_text("private")
            with self.assertRaisesRegex(ValueError, "private"):
                package.prepare(library, library)
            (site / "signing.private.pem").unlink()
            (site / "lti.platform.local.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "private"):
                package.prepare(library, library)
            (site / "lti.platform.local.json").unlink()
            outside = library / "private"
            outside.mkdir()
            (site / "outside").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symlink"):
                package.prepare(library, library)


if __name__ == "__main__":
    unittest.main()
