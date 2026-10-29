import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/prepare_gallery.py"
spec = importlib.util.spec_from_file_location("gallery", SCRIPT)
gallery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gallery)


class GalleryTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node is required for website asset preparation")
    def test_website_preparation_does_not_read_or_publish_local_projects(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            script = root / "scripts/prepare-gallery.mjs"
            shutil.copy2(SCRIPT.with_name("prepare-gallery.mjs"), script)
            brand = root / "assets/brand"
            brand.mkdir(parents=True)
            for name in ("logo.png", "wordmark.png", "space-hero.png", "Rubik-Regular.ttf", "Rubik-Bold.ttf", "Rubik-OFL.txt"):
                (brand / name).write_bytes(b"brand fixture")
            project = root / "projects/unpublished"
            project.mkdir(parents=True)
            (project / "content.json").write_text("invalid JSON that must not be read")
            (project / "private-video.mp4").write_bytes(b"unpublished video")
            environment = {key: value for key, value in os.environ.items() if key != "LIBRARY_PREVIEW_DIR"}
            subprocess.run(["node", str(script)], check=True, env=environment)
            public = root / "learning-library/public/library"
            self.assertEqual(json.loads((public / "catalog.json").read_text()), [])
            self.assertEqual({path.name for path in public.iterdir()}, {"brand", "catalog.json"})

    def test_scorm_timeline_keeps_current_questions_and_validates_scene_identity(self):
        doc = {"title": "Lesson", "scenes": [{"id": "one", "title": "One", "quiz": {"question": "Current"}}]}
        rendered = {"scenes": [{"id": "one", "start": 0, "duration": 12, "quiz": {"question": "Old"}}]}
        timeline = gallery.scorm_timeline(doc, rendered)
        self.assertEqual(timeline["scenes"][0]["quiz"]["question"], "Current")
        self.assertEqual(timeline["scenes"][0]["duration"], 12)
        with self.assertRaisesRegex(ValueError, "scene IDs"):
            gallery.scorm_timeline(doc, {"scenes": []})

    def test_linked_video_is_normalized_and_only_referenced_assets_are_copied(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            player = root / "source/interactive"
            player.mkdir(parents=True)
            (player.parent / "approved.mp4").write_bytes(b"video")
            (player / "captions.vtt").write_text("WEBVTT")
            (player / "font.ttf").write_bytes(b"font")
            (player / ".env").write_text("PRIVATE=example")
            (player / "unused.wav").write_bytes(b"cache")
            (player / "index.html").write_text('<style>@font-face{src:url(font.ttf)}</style><video src="../approved.mp4"><track src="captions.vtt"></video>')
            output = root / "package"
            gallery.package_player(player, output, boundary=root)
            self.assertIn('src="video.mp4"', (output / "index.html").read_text())
            self.assertEqual({p.name for p in output.iterdir()}, {"index.html", "video.mp4", "captions.vtt", "font.ttf"})

    def test_missing_media_and_symlinks_outside_boundary_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "index.html").write_text('<video src="missing.mp4"></video>')
            with self.assertRaises(ValueError):
                gallery.package_player(root, root / "package", boundary=root)
            (root / "outside.mp4").symlink_to(SCRIPT)
            (root / "index.html").write_text('<video src="outside.mp4"></video>')
            with self.assertRaises(ValueError):
                gallery.package_player(root, root / "package", boundary=root)

    def test_source_discovery_does_not_pick_up_outputs_or_drafts(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ("projects/demo/content.json", "examples/community/content.json", "projects/demo/output/draft/content.json"):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("{}")
            self.assertEqual(set(gallery.content_sources(root)), {"demo", "community"})


if __name__ == "__main__":
    unittest.main()
