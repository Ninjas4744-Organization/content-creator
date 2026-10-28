import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from davinci_creator import photos
from davinci_creator.common import validate


URL = "https://photos.google.com/share/ALBUM?key=SHARED"


def row(photo_id="PHOTO1", video=False):
    media = ["https://lh3.googleusercontent.com/pw/" + photo_id, 1200, 800, None, None, None, None,
             None]
    metadata = {"76647426": [12500, None, 1200, 800]} if video else {}
    return [photo_id, media, 1234567890000] + [None] * 6 + [metadata]


def data(rows=None, token="", total=1):
    metadata = ["ALBUM", "תמונות הקבוצה <test>"] + [None] * 19 + [total]
    return [None, rows if rows is not None else [row()], token, metadata, None, 0]


def page(value):
    return ("var AF_dataServiceRequests = {'ds:7' : {id:'snAcKc',ext: 123,request:" +
            json.dumps(["ALBUM", None, None, "SHARED"]) + "}};" +
            "AF_initDataCallback({key: 'ds:7', hash: '1', data:" + json.dumps(value) + ", sideChannel: {}});").encode()


def rpc(value):
    return (")]}'\n\n12345\n" + json.dumps([["wrb.fr", "snAcKc", json.dumps(value), None]]) + "\n").encode()


class PhotoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.assets = self.root / "assets"
        self.assets.mkdir()
        (self.assets / "photo-albums.json").write_text(json.dumps({"version": 1, "albums": [
            {"id": "team", "title": "Team", "url": URL}]}))
        self.addCleanup(patch.stopall)
        patch.object(photos, "ASSETS", self.assets).start()

    def catalog(self, rows=None):
        value = data(rows, total=len(rows) if rows is not None else 1)
        with patch.object(photos, "_fetch", return_value=(page(value), URL)):
            return photos.catalog("team")

    def image(self):
        output = io.BytesIO()
        image = Image.new("RGB", (1200, 800), "#245590")
        exif = Image.Exif()
        exif[270] = "metadata must not be exported"
        image.save(output, "JPEG", exif=exif)
        return output.getvalue(), "https://lh3.googleusercontent.com/pw/PHOTO1"

    def test_registry_and_direct_shared_url(self):
        self.assertEqual(photos.source("team"), ("team", URL))
        self.assertTrue(photos.source(URL)[0].startswith("shared-"))
        with self.assertRaises(ValueError):
            photos.source("missing-album")

    def test_full_album_pagination_deduplication_and_video_skip(self):
        first = data([row(), row("VIDEO", True)], token="NEXT", total=3)
        second = data([row(), row("PHOTO2")], total=3)
        with patch.object(photos, "_fetch", side_effect=[(page(first), URL), (rpc(second), URL)]) as fetch:
            album = photos.catalog("team")
        self.assertEqual([photo["id"] for photo in album["photos"]], ["PHOTO1", "PHOTO2"])
        self.assertEqual(album["skipped_videos"], 1)
        from urllib.parse import parse_qs
        body = json.loads(parse_qs(fetch.call_args.kwargs["body"].decode())["f.req"][0])
        self.assertEqual(json.loads(body[0][0][1]), ["ALBUM", "NEXT", None, "SHARED"])
        self.assertNotIn("1234567890000", json.dumps(album))

    def test_repeated_token_fails_and_count_difference_is_disclosed(self):
        with patch.object(photos, "_fetch", side_effect=[(page(data(token="NEXT")), URL), (rpc(data(token="NEXT")), URL)]):
            with self.assertRaisesRegex(ValueError, "repeated"):
                photos.catalog("team")
        with patch.object(photos, "_fetch", return_value=(page(data(total=2)), URL)):
            album = photos.catalog("team")
        self.assertEqual(album["received_item_count"], 1)
        self.assertEqual(album["reported_item_count"], 2)
        self.assertIn("returned 1", album["warnings"][0])
        photos.gallery(album, self.root / "out")
        self.assertIn("returned 1", (self.root / "out/index.html").read_text())

    def test_legacy_video_marker_is_also_skipped(self):
        legacy = row("LEGACY_VIDEO")
        legacy[1][7] = [1000]
        album = self.catalog([row(), legacy])
        self.assertEqual([photo["id"] for photo in album["photos"]], ["PHOTO1"])
        self.assertEqual(album["skipped_videos"], 1)

    def test_login_and_unknown_page_format_fail(self):
        for content, url in [(b"login", "https://photos.google.com/login"), (b"<html>unavailable</html>", URL)]:
            with self.subTest(url=url), patch.object(photos, "_fetch", return_value=(content, url)):
                with self.assertRaises(ValueError):
                    photos.catalog("team")

    def test_url_allowlist_including_redirects(self):
        for url in ["http://photos.google.com/share/a", "https://photos.google.com.evil.test/share/a",
                    "https://user:secret@photos.google.com/share/a", "https://photos.google.com:8000/share/a",
                    "https://127.0.0.1/a"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                photos._allowed_url(url)
        with self.assertRaises(ValueError):
            photos._Redirects(False).redirect_request(None, None, 302, "", {}, "https://accounts.google.com/login")
        with self.assertRaises(ValueError):
            photos._allowed_url("https://lh3.googleusercontent.com.evil.test/a", media=True)

    def test_import_normalizes_metadata_resizes_and_exports_usable_assets(self):
        album = self.catalog()
        out = self.root / "output"
        with patch.object(photos, "_fetch", return_value=self.image()):
            result = photos.import_photos(album, out, size=640)
        entry = result["photos"][0]
        with Image.open(self.assets / entry["image"]) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertEqual(image.size, (640, 427))
            self.assertFalse(image.getexif())
        with patch("davinci_creator.common.ASSETS", self.assets):
            validate({"version": 1, "title": "Test", "scenes": [
                {"id": "photo", "title": "Team", "layout": "photo", "image": entry["image"]}]})
        self.assertTrue((out / "storyboard.jpg").is_file())
        content = (out / "index.html").read_text()
        self.assertIn("&lt;test&gt;", content)
        self.assertNotIn('<img loading="lazy" src="https://', content)
        self.assertIn('src="data:image/jpeg;base64,', content)
        self.assertNotIn("base_url", (out / "manifest.json").read_text())

    def test_cached_downloads_resume_without_redownloading(self):
        album = self.catalog([row(), row("PHOTO2")])
        with patch.object(photos, "_fetch", side_effect=[self.image(), ValueError("interrupted")]):
            with self.assertRaisesRegex(ValueError, "interrupted"):
                photos.import_photos(album, self.root / "out")
        with patch.object(photos, "_fetch", return_value=self.image()) as fetch:
            result = photos.import_photos(album, self.root / "out")
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(len(result["photos"]), 2)
        with patch.object(photos, "_fetch", side_effect=AssertionError("Unexpected download")):
            photos.import_photos(album, self.root / "out")

    def test_specific_ids_offset_and_missing_selection(self):
        album = self.catalog([row(), row("PHOTO2"), row("PHOTO3")])
        with patch.object(photos, "_fetch", return_value=self.image()):
            result = photos.import_photos(album, self.root / "out", offset=1, limit=1)
            self.assertEqual(result["photos"][0]["id"], "PHOTO2")
            result = photos.import_photos(album, self.root / "out", photo_ids=["PHOTO3", "PHOTO1"])
            self.assertEqual({p["id"] for p in result["photos"]}, {"PHOTO1", "PHOTO3"})
        with self.assertRaisesRegex(ValueError, "absent"):
            photos.import_photos(album, self.root / "out", photo_ids=["MISSING"])
        with self.assertRaisesRegex(ValueError, "No photos"):
            photos.import_photos(album, self.root / "out", offset=999)

    def test_corrupted_cache_and_non_images_are_rejected(self):
        album = self.catalog()
        with patch.object(photos, "_fetch", return_value=(b"<html>not a photo</html>", URL)):
            with self.assertRaisesRegex(ValueError, "supported photo"):
                photos.import_photos(album, self.root / "out")
        with patch.object(photos, "_fetch", return_value=self.image()):
            result = photos.import_photos(album, self.root / "out")
        path = self.assets / result["photos"][0]["image"]
        path.write_bytes(b"user edit")
        with self.assertRaisesRegex(ValueError, "differs"):
            photos.import_photos(album, self.root / "out")
        self.assertEqual(path.read_bytes(), b"user edit")

    def test_catalog_gallery_escapes_remote_content(self):
        album = self.catalog()
        out = self.root / "out"
        photos.gallery(album, out)
        self.assertIn("https://lh3.googleusercontent.com", (out / "index.html").read_text())
        self.assertEqual(json.loads((out / "catalog.json").read_text())["photo_count"], 1)


if __name__ == "__main__":
    unittest.main()
