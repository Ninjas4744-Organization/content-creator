import copy
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("publish_library", ROOT / "scripts/publish_library.py")
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class StorageError(Exception):
    def __init__(self, code):
        self.response = {"Error": {"Code": code}}


class FakeStorage:
    def __init__(self):
        self.objects = {}
        self.corrupt = False
        self.conflict = False

    def get_object(self, *, Bucket, Key):
        if Key not in self.objects:
            raise StorageError("NoSuchKey")
        data = self.objects[Key]
        if self.corrupt and Key.startswith("library/releases/"):
            data = b"corrupt"
        return {"Body": io.BytesIO(data), "ETag": str(hash(data))}

    def upload_file(self, filename, bucket, key, **kwargs):
        self.objects[key] = Path(filename).read_bytes()

    def put_object(self, *, Bucket, Key, Body, **kwargs):
        if Key == publisher.CATALOG:
            if self.conflict:
                raise StorageError("PreconditionFailed")
            if "IfMatch" in kwargs and kwargs["IfMatch"] != str(hash(self.objects[Key])):
                raise StorageError("PreconditionFailed")
            if kwargs.get("IfNoneMatch") == "*" and Key in self.objects:
                raise StorageError("PreconditionFailed")
        self.objects[Key] = Body


class R2PublishTests(unittest.TestCase):
    def package(self, root):
        directory = Path(root)
        item = {"id": "demo", "title": "Lesson", "chapters": ["Opening"],
                "poster": "library/media/demo/poster.jpg", "deck": "library/media/demo/presentation.html",
                "powerpoint": None, "video": None, "scorm": {"deck": "library/exports/demo/slides.zip"}}
        (directory / "catalog.json").write_text(json.dumps([item]))
        for key in [item["poster"], item["deck"], item["scorm"]["deck"]]:
            path = directory / key.removeprefix("library/")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"public media")
        return directory, item

    def test_verified_release_merges_without_losing_other_lessons(self):
        with tempfile.TemporaryDirectory() as root:
            directory, item = self.package(root)
            storage = FakeStorage()
            other = {**item, "id": "other", "title": "Retained"}
            storage.objects[publisher.CATALOG] = json.dumps([other, item]).encode()
            receipt = publisher.publish(directory, storage, "test-bucket")
            catalog = json.loads(storage.objects[publisher.CATALOG])
            self.assertEqual(catalog[0], other)
            self.assertEqual(catalog[1]["id"], "demo")
            for key in ("poster", "deck"):
                self.assertIn("library/releases/" + receipt["release"], catalog[1][key])
                self.assertIn(catalog[1][key], storage.objects)
            self.assertEqual(len(receipt["files"]), 3)
            self.assertEqual(json.loads(storage.objects[f"library/history/{receipt['release']}.json"]), [other, item])

    def test_initial_publication_creates_the_catalog(self):
        with tempfile.TemporaryDirectory() as root:
            directory, _ = self.package(root)
            storage = FakeStorage()
            publisher.publish(directory, storage, "test-bucket")
            self.assertEqual(len(json.loads(storage.objects[publisher.CATALOG])), 1)

    def test_corrupt_remote_file_never_replaces_the_catalog(self):
        with tempfile.TemporaryDirectory() as root:
            directory, item = self.package(root)
            storage = FakeStorage()
            storage.objects[publisher.CATALOG] = json.dumps([item]).encode()
            before = storage.objects[publisher.CATALOG]
            storage.corrupt = True
            with self.assertRaisesRegex(ValueError, "Remote verification"):
                publisher.publish(directory, storage, "test-bucket")
            self.assertEqual(storage.objects[publisher.CATALOG], before)

    def test_concurrent_publication_fails_without_overwriting(self):
        with tempfile.TemporaryDirectory() as root:
            directory, item = self.package(root)
            storage = FakeStorage()
            storage.objects[publisher.CATALOG] = json.dumps([item]).encode()
            before = copy.deepcopy(storage.objects[publisher.CATALOG])
            storage.conflict = True
            with self.assertRaises(StorageError):
                publisher.publish(directory, storage, "test-bucket")
            self.assertEqual(storage.objects[publisher.CATALOG], before)

    def test_missing_files_private_assets_and_symlinks_fail_before_upload(self):
        for invalid in ("missing", "private", "symlink"):
            with self.subTest(invalid=invalid), tempfile.TemporaryDirectory() as root:
                directory, item = self.package(root)
                target = directory / "media/demo/poster.jpg"
                if invalid == "missing":
                    target.unlink()
                elif invalid == "private":
                    (target.parent / ".env").write_text("private")
                else:
                    target.unlink()
                    target.symlink_to(directory / "catalog.json")
                storage = FakeStorage()
                with self.assertRaises(ValueError):
                    publisher.publish(directory, storage, "test-bucket")
                self.assertEqual(storage.objects, {})


if __name__ == "__main__":
    unittest.main()
