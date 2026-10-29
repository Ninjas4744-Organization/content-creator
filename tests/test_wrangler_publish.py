import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("wrangler_publish", ROOT / "scripts/publish_library_wrangler.py")
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class MemoryStorage:
    def __init__(self, *, corrupt=False, conflict=False):
        self.objects = {}
        self.corrupt = corrupt
        self.conflict = conflict
        self.catalog_reads = 0

    def read(self, key):
        if key == publisher.CATALOG:
            self.catalog_reads += 1
            if self.conflict and self.catalog_reads > 1:
                return b'[]'
        if self.corrupt and key.startswith("library/releases/"):
            return b"corrupt"
        return self.objects.get(key)

    def write(self, key, data, content_type):
        self.objects[key] = data


class WranglerPublishTests(unittest.TestCase):
    def package(self, root):
        directory = Path(root)
        item = {"id": "new", "title": "New deck", "chapters": ["Opening"], "deck": "library/media/new/presentation.html", "scorm": {}}
        (directory / "media/new").mkdir(parents=True)
        (directory / "media/new/presentation.html").write_text("verified deck")
        (directory / "catalog.json").write_text(json.dumps([item]))
        return directory

    def test_existing_lessons_survive_and_promoted_assets_are_verified(self):
        with tempfile.TemporaryDirectory() as root:
            directory = self.package(root)
            storage = MemoryStorage()
            previous = [{"id": "other", "title": "Other", "chapters": []}]
            storage.objects[publisher.CATALOG] = json.dumps(previous).encode()
            receipt = publisher.publish(directory, storage)
            result = json.loads(storage.objects[publisher.CATALOG])
            self.assertEqual(result[0], previous[0])
            self.assertEqual(storage.objects[result[1]["deck"]], b"verified deck")
            self.assertEqual(json.loads(storage.objects[f"library/history/{receipt['release']}.json"]), previous)

    def test_corrupt_upload_or_changed_catalog_never_promotes_release(self):
        for options in ({"corrupt": True}, {"conflict": True}):
            with self.subTest(options=options), tempfile.TemporaryDirectory() as root:
                storage = MemoryStorage(**options)
                with self.assertRaises(ValueError):
                    publisher.publish(self.package(root), storage)
                self.assertNotIn(publisher.CATALOG, storage.objects)


if __name__ == "__main__":
    unittest.main()
