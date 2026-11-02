import base64
import copy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from uuid import uuid4
from zipfile import ZipFile
from PIL import Image

from davinci_creator.common import ASSETS, ROOT, validate, write_json
from davinci_creator.backgrounds import themed_elements
from davinci_creator.render import frame, storyboard
from davinci_creator.deck import html_deck, pptx_deck
from davinci_creator.project_store import pack


class BackgroundTests(unittest.TestCase):
    def setUp(self):
        folder = ASSETS / "projects"
        folder.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="background-", dir=folder)
        self.folder = Path(self.temporary.name)
        Image.new("RGB", (32, 18), "#E8F2F4").save(self.folder / "body.png")
        Image.new("RGB", (32, 18), "#102742").save(self.folder / "cover.png")
        self.selection = {"id": "custom", "image": (self.folder / "body.png").relative_to(ASSETS).as_posix(), "coverImage": (self.folder / "cover.png").relative_to(ASSETS).as_posix(), "selectionReason": "A calm background for this training"}
        self.doc = {"version": 1, "title": "בדיקת רקעים", "background": self.selection, "scenes": [{"id": "cover", "title": "פתיחה", "layout": "cover"}, {"id": "body", "title": "תוכן", "layout": "blank"}]}

    def tearDown(self):
        self.temporary.cleanup()

    def test_choice_is_required_for_new_documents_and_legacy_sources_still_render(self):
        validate(copy.deepcopy(self.doc))
        for selection in [None, {}, {**self.selection, "selectionReason": ""}, {**self.selection, "image": "../outside.png"}]:
            with self.assertRaises(ValueError):
                validate({**self.doc, "background": selection})
        legacy = {key: value for key, value in self.doc.items() if key != "background"}
        validate(legacy)
        self.assertEqual(frame(legacy["scenes"][1], 1, 2).size, (1280, 720))

    def test_html_powerpoint_and_previews_use_the_chosen_cover_and_body(self):
        validate(self.doc)
        body = frame(self.doc["scenes"][1], 1, 2, background_selection=self.selection)
        cover = frame(self.doc["scenes"][0], 0, 2, background_selection=self.selection)
        self.assertEqual(body.getpixel((1279, 719)), (232, 242, 244))
        self.assertEqual(cover.getpixel((1279, 719)), (16, 39, 66))
        statement = {"id": "text", "title": "טקסט קריא", "layout": "statement", "body": "בדיקה"}
        self.assertTrue(any(item.get("color") == "17333A" for item in themed_elements(statement, 1, 2, self.selection)))
        doc = {**self.doc, "scenes": [self.doc["scenes"][0], statement]}
        html_deck(doc, self.folder / "deck.html")
        html = (self.folder / "deck.html").read_text()
        for name in ["body.png", "cover.png"]:
            self.assertIn(base64.b64encode((self.folder / name).read_bytes()).decode(), html)
        self.assertIn("color:#17333A", html)
        pptx_deck(doc, self.folder / "deck.pptx")
        with ZipFile(self.folder / "deck.pptx") as archive:
            self.assertIn(b"17333A", archive.read("ppt/slides/slide2.xml"))
        storyboard(self.doc, self.folder / "previews")
        with Image.open(self.folder / "previews/slide-02.png") as preview:
            self.assertEqual(preview.getpixel((1279, 719)), (232, 242, 244))

    def test_source_packages_keep_selected_background_assets(self):
        pid = "background-test-" + uuid4().hex
        project = ROOT / "projects" / pid
        project.mkdir(parents=True)
        try:
            write_json(project / "content.json", self.doc)
            import io
            with ZipFile(io.BytesIO(pack(ROOT, pid))) as archive:
                self.assertIn("assets/" + self.selection["image"], archive.namelist())
                self.assertIn("assets/" + self.selection["coverImage"], archive.namelist())
        finally:
            shutil.rmtree(project)

    def test_rendered_video_uses_selected_background_in_worker_processes(self):
        from davinci_creator.video import render, ffmpeg
        with tempfile.TemporaryDirectory() as output:
            path = render(validate(self.doc), Path(output), Path(output) / "voices", fps=4, width=320, workers=1, draft=True, seconds=1)
            result = subprocess.run([ffmpeg(), "-v", "error", "-ss", "1.75", "-i", str(path), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True)
            self.assertEqual(len(result.stdout), 320 * 180 * 3)
            pixel = result.stdout[-3:]
            self.assertTrue(all(abs(actual - expected) < 12 for actual, expected in zip(pixel, [232, 242, 244])))
