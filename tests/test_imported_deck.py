import copy
import tempfile
import unittest
from pathlib import Path

from davinci_creator.common import ROOT, load, validate
from davinci_creator.deck import build, html_deck, pptx_deck


class ImportedDeckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = load(ROOT / "projects/recruitment/source/imported-content.json")

    def test_original_editable_powerpoint_is_preserved_byte_for_byte(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "presentation.pptx"
            pptx_deck(self.doc, path)
            self.assertEqual(path.read_bytes(), (ROOT / self.doc["source_deck"]["powerpoint"]).read_bytes())

    def test_web_deck_retains_all_slides_videos_links_animation_and_noindex(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "presentation.html"
            html_deck(self.doc, path)
            content = path.read_text()
            self.assertEqual(content.count('<section class="slide'), 13)
            self.assertEqual(content.count('class="source-video"'), 3)
            for video in ("_fybREErgyM", "LpSKkulNuz8", "3-_qhjSbCCU"):
                self.assertIn(f'data-youtube="{video}"', content)
            self.assertIn('class="source-link"', content)
            self.assertIn("data:image/gif;base64,", content)
            self.assertIn('name="robots" content="noindex,nofollow"', content)
            # Remote video loads only after the viewer explicitly clicks play.
            self.assertNotIn('<iframe src="https://', content)
            self.assertIn("frame=>frame.remove()", content)

    def test_invalid_imported_sources_fail_before_building(self):
        for mutation in ("outside", "count", "video", "link", "geometry", "crop"):
            doc = copy.deepcopy(self.doc)
            slides = doc["source_deck"]["slides"]
            if mutation == "outside":
                slides[0]["image"] = "../outside.jpg"
            elif mutation == "count":
                slides.pop()
            elif mutation == "video":
                slides[3]["youtube"] = 'invalid" onload="example'
            elif mutation == "link":
                slides[2]["links"][0]["href"] = "javascript:example()"
            elif mutation == "geometry":
                slides[2]["links"][0]["x"] = float("nan")
            else:
                slides[10]["overlays"][0]["crop"] = {"top": 0.8, "bottom": 0.8}
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                validate(doc)

    def test_source_storyboard_has_all_imported_slides(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            build(self.doc, output)
            self.assertEqual(len(list((output / "previews").glob("slide-*.png"))), 13)
            self.assertTrue((output / "previews/storyboard.jpg").is_file())


if __name__ == "__main__":
    unittest.main()
