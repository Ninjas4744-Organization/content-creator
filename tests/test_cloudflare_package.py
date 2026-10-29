import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("prepare_cloudflare", ROOT / "scripts/prepare_cloudflare.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class CloudflarePackageTests(unittest.TestCase):
    def test_public_assets_and_video_metadata_need_no_lms_or_content_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            library = Path(directory)
            site = library / "output/site"
            site.mkdir(parents=True)
            (site / "index.html").write_text("public library")
            (site / "example.mp4").write_bytes(b"test media")
            (site / "lesson.zip").write_bytes(b"PK SCORM archive")
            data = library / "output/cloudflare-data"
            data.mkdir(parents=True)
            (data / "lessons.json").write_text("stale private assessments")
            package.prepare(library)
            public = library / "output/cloudflare-assets"
            self.assertEqual((public / "index.html").read_text(), "public library")
            self.assertEqual((public / "lesson.zip").read_bytes(), b"PK SCORM archive")
            self.assertIn("frame-ancestors 'self';", (public / "_headers").read_text())
            self.assertEqual(json.loads((data / "media.json").read_text()), {"/example.mp4": 10})
            self.assertEqual({path.name for path in data.iterdir()}, {"media.json"})

    def test_oversized_assets_fail_before_a_deployment_can_start(self):
        with tempfile.TemporaryDirectory() as directory:
            library = Path(directory)
            site = library / "output/site"
            site.mkdir(parents=True)
            (site / "index.html").write_text("public")
            with (site / "large.mp4").open("wb") as stream:
                stream.truncate(25 * 1024 * 1024 + 1)
            with self.assertRaisesRegex(ValueError, "25 MiB"):
                package.prepare(library)

    def test_private_files_and_directory_symlinks_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            library = Path(directory)
            site = library / "output/site"
            site.mkdir(parents=True)
            (site / "index.html").write_text("public")
            for name in ["signing.private.pem", "integration.local.json", "platform-secrets.json"]:
                path = site / name
                path.write_text("private")
                with self.assertRaisesRegex(ValueError, "private"):
                    package.prepare(library)
                path.unlink()
            outside = library / "private"
            outside.mkdir()
            (site / "outside").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symlink"):
                package.prepare(library)


if __name__ == "__main__":
    unittest.main()
