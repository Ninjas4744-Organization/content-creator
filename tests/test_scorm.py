import copy
import json
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

from davinci_creator.common import ROOT, load
from davinci_creator.scorm import ADL, CP, build_scorm, configuration


class ScormTests(unittest.TestCase):
    def setUp(self):
        self.doc = load(ROOT / "examples/community/content.json")

    def test_package_manifest_and_resources(self):
        self.doc["title"] = 'בדיקה & <למידה> "SCORM"'
        self.doc["scenes"][0]["quiz"] = {"question": "</script><img src=x>", "options": ["א", "ב"], "correct": 0}
        with tempfile.TemporaryDirectory() as temporary:
            archive = build_scorm(self.doc, Path(temporary))
            with ZipFile(archive) as zipped:
                root = ET.fromstring(zipped.read("imsmanifest.xml"))
                ns = {"cp": CP, "adlcp": ADL}
                self.assertEqual(root.find("cp:metadata/cp:schemaversion", ns).text, "1.2")
                resources = root.findall("cp:resources/cp:resource", ns)
                self.assertEqual(len(resources), 1)
                resource = resources[0]
                self.assertEqual(resource.attrib[f"{{{ADL}}}scormtype"], "sco")
                self.assertEqual(resource.attrib["href"], "index.html")
                files = {f.attrib["href"] for f in resource.findall("cp:file", ns)}
                self.assertEqual(files, set(zipped.namelist()) - {"imsmanifest.xml"})
                self.assertFalse(any(".." in Path(p).parts or p.startswith("/") for p in files))
                html = zipped.read("index.html").decode()
                self.assertNotIn("</script><img", html)
                self.assertIn("בדיקה &amp; &lt;למידה&gt;", html)
                media = zipped.read("media/index.html").decode()
                self.assertIn("../learning_bridge.js", media)
                self.assertIn("DAVINCI_MANAGED_PROGRESS=true", media)
                self.assertNotIn("__CONFIG__", html)

    def test_video_is_self_contained_and_attempt_scoped(self):
        timeline = load(ROOT / "examples/community/approved-timeline.json")
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            video = folder / "input.mp4"
            video.write_bytes(b"small media fixture")
            shutil.copy2(ROOT / "examples/community/poster.jpg", folder / "poster.jpg")
            archive = build_scorm(timeline, folder / "out", mode="video", video=video)
            with ZipFile(archive) as zipped:
                self.assertEqual(zipped.read("media/video.mp4"), b"small media fixture")
                self.assertTrue(zipped.read("media/captions.vtt").startswith(b"WEBVTT"))
                html = zipped.read("index.html").decode()
                self.assertIn('src="media/video.mp4"', html)
                self.assertNotIn("media/index.html", zipped.namelist())
                self.assertNotIn("<iframe", html)
                self.assertNotIn('id="checkpoints"', html)
                self.assertNotIn("localStorage", zipped.read("scorm_player.js").decode())
                self.assertEqual(html.count("<h1>"), 1)
                self.assertEqual(html.count('id="assessment"'), 1)

    def test_invalid_configuration_and_resume_budget(self):
        for pass_score, coverage in [(float("nan"), .9), (1.1, .9), (.8, 0), (.8, float("inf"))]:
            with self.assertRaises(ValueError): configuration(self.doc, "slides", pass_score, coverage)
        with self.assertRaisesRegex(ValueError, "timeline"):
            configuration(self.doc, "video", .8, .9)
        doc = copy.deepcopy(self.doc)
        doc["scenes"] = [{"id": f"s{i}", "title": "x", "layout": "cover"} for i in range(4000)]
        with self.assertRaisesRegex(ValueError, "resume storage"):
            configuration(doc, "slides", .8, .9)
        self.assertNotEqual(configuration(self.doc, "slides", .8, .9)["key"],
                            configuration(self.doc, "slides", .7, .9)["key"])

    def test_failed_export_preserves_previous_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary)
            archive = out / "lesson.zip"
            archive.write_bytes(b"previous")
            with self.assertRaises(ValueError): build_scorm(self.doc, out, mode="video")
            self.assertEqual(archive.read_bytes(), b"previous")

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for SCORM runtime tests")
    def test_browser_runtime(self):
        subprocess.run(["node", str(ROOT / "tests/scorm_runtime.test.cjs")], check=True, cwd=ROOT)


if __name__ == "__main__":
    unittest.main()
