import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "creator-kit/scripts"))


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


builder = module("kit_builder", ROOT / "scripts/build-creator-kit.py")
agent = module("kit_agent", ROOT / "creator-kit/scripts/creator_agent.py")


class CreatorKitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.data = builder.build(builder.creator_root(), Path(cls.temp.name))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_download_is_self_contained_and_repeatable(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(self.data, builder.build(builder.creator_root(), Path(folder)))
        with ZipFile(io.BytesIO(self.data)) as archive:
            manifest = json.loads(archive.read("davinci-creator/creator-kit-files.json"))
            for name, digest in manifest["files"].items():
                self.assertTrue(agent.managed_path(name), name)
                self.assertEqual(hashlib.sha256(archive.read("davinci-creator/" + name)).hexdigest(), digest)
            for skill in ["davinci-presentation", "davinci-interactive-video", "davinci-publish", "davinci-update"]:
                self.assertIn(f".agents/skills/{skill}/SKILL.md", manifest["files"])
                self.assertIn(f".claude/skills/{skill}/SKILL.md", manifest["files"])
            self.assertFalse(any("projects/" in name or ".env" in name or name.endswith(".pyc") for name in manifest["files"]))
            for name in ["pyproject.toml", "scripts/setup.py", "scripts/prepare_gallery.py", "src/davinci_creator/deck.py", "assets/brand/Rubik-Regular.ttf"]:
                self.assertIn(name, manifest["files"])

    def test_updates_keep_projects_custom_assets_credentials_and_local_edits(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            version = agent.install_update(self.data, root)
            for name in ["projects/mine/content.json", "outputs/my-video.mp4", "assets/projects/mine/photo.jpg", ".env"]:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"keep my local work")
            self.assertEqual(agent.install_update(self.data, root), version)
            for name in ["projects/mine/content.json", "outputs/my-video.mp4", "assets/projects/mine/photo.jpg", ".env"]:
                self.assertEqual((root / name).read_bytes(), b"keep my local work")
            changed = root / "scripts/setup.py"
            changed.write_text("# local customization\n")
            before = (root / "creator-kit-files.json").read_bytes()
            with self.assertRaisesRegex(ValueError, "Local edits preserved"):
                agent.install_update(self.data, root)
            self.assertEqual(changed.read_text(), "# local customization\n")
            self.assertEqual((root / "creator-kit-files.json").read_bytes(), before)

    def test_fresh_download_creates_a_project_without_a_git_checkout(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            agent.install_update(self.data, root)
            result = subprocess.run([sys.executable, "-m", "davinci_creator", "new", "kit-test", "--title", "ערכת יצירה"], cwd=root, env={**os.environ, "PYTHONPATH": str(root / "src")}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            content = json.loads((root / "projects/kit-test/content.json").read_text(encoding="utf-8"))
            self.assertEqual(content["title"], "ערכת יצירה")
            self.assertTrue((root / "projects/kit-test/brief.md").is_file())

    def test_bad_archive_checksums_and_symlink_destinations_change_nothing(self):
        buffer = io.BytesIO()
        with ZipFile(io.BytesIO(self.data)) as source, ZipFile(buffer, "w") as target:
            for info in source.infolist():
                content = source.read(info)
                if info.filename == "davinci-creator/scripts/setup.py":
                    content = b"tampered"
                target.writestr(info, content)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with self.assertRaisesRegex(ValueError, "checksum"):
                agent.install_update(buffer.getvalue(), root)
            self.assertEqual(list(root.iterdir()), [])
            outside = root / "outside"
            outside.mkdir()
            (root / "scripts").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symlink"):
                agent.install_update(self.data, root)
            self.assertEqual(list(outside.iterdir()), [])

    def test_download_digest_mismatch_never_installs(self):
        class Api:
            def request(self, path, **kwargs):
                if path.endswith("manifest"):
                    return {"schemaVersion": 1, "size": 3, "sha256": "a" * 64}
                return b"bad"
        with patch.object(agent, "install_update") as install:
            with self.assertRaisesRegex(ValueError, "checksum"):
                agent.update(Api())
            install.assert_not_called()

    def test_resume_recovers_partial_upload_and_verifies_publication(self):
        class Api:
            def __init__(self):
                self.parts = []
            def request(self, path, method="GET", data=None):
                if path == "/catalog":
                    return {"items": [{"id": "mine", "poster": "library/releases/" + "a" * 32 + "/media/mine/poster.jpg"}]}
                if path.endswith("/publish"):
                    return {"ids": ["mine"], "published": True}
                if "/parts/" in path:
                    self.parts.append(data)
                    return {"partNumber": 2, "etag": "second"}
                if path.endswith("/complete"):
                    assert data["parts"] == [{"partNumber": 1, "etag": "first"}, {"partNumber": 2, "etag": "second"}]
                return {"complete": False}
        with tempfile.TemporaryDirectory() as folder:
            stage = Path(folder)
            file = stage / "video.mp4"
            file.write_bytes(b"a" * agent.CHUNK + b"tail")
            agent.save_json(stage / "upload.json", {"id": "a" * 32, "files": [{"path": "video.mp4", "size": file.stat().st_size, "hashes": agent.file_hashes(file)}], "parts": {"0": [{"partNumber": 1, "etag": "first"}]}})
            api = Api()
            self.assertTrue(agent.resume(api, stage)["published"])
            self.assertEqual(api.parts, [b"tail"])
            file.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "changed"):
                agent.resume(api, stage)


if __name__ == "__main__":
    unittest.main()
