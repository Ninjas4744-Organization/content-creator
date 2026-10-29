import copy
import hashlib
import io
import json
from pathlib import Path
import stat
import tempfile
import unittest
from zipfile import ZipFile

from davinci_creator.project_store import INDEX, pack, pull, push, read_index, unpack


class MemoryStorage:
    def __init__(self):
        self.objects = {}
        self.corrupt = False
        self.concurrent = False

    def read(self, key):
        data = self.objects.get(key)
        return b"corrupt" if data is not None and key.endswith(".zip") and self.corrupt else data

    def write(self, key, data, content_type):
        self.objects[key] = data
        if self.concurrent and key.endswith(".zip"):
            self.objects[INDEX] = json.dumps({"version": 1, "projects": {}, "other_update": True}).encode()


class ProjectStoreTests(unittest.TestCase):
    def workspace(self, root):
        root = Path(root)
        project = root / "projects/demo"
        project.mkdir(parents=True)
        (project / "content.json").write_text(json.dumps({"title": "Demo", "image": "projects/demo/photo.png"}))
        (project / "brief.md").write_text("Editable brief")
        (project / "build_video.py").write_text('SCRIPT = "<svg>" * 10000\n')
        (project / "publication.json").write_text(json.dumps({"category": "Training", "source_assets": ["assets/projects/demo"]}))
        asset = root / "assets/projects/demo/photo.png"
        asset.parent.mkdir(parents=True)
        asset.write_bytes(b"photo fixture")
        (asset.parent / "unused-reference.svg").write_bytes(b"<svg/>")
        return root, project

    def rewrite(self, archive, mutation):
        with ZipFile(io.BytesIO(archive)) as source:
            files = {name: source.read(name) for name in source.namelist()}
        manifest = json.loads(files["manifest.json"])
        mutation(files, manifest)
        files["manifest.json"] = json.dumps(manifest).encode()
        result = io.BytesIO()
        with ZipFile(result, "w") as target:
            for name, body in files.items():
                target.writestr(name, body)
        return result.getvalue()

    def test_roundtrip_restores_sources_publication_metadata_and_external_assets(self):
        with tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as destination:
            root, project = self.workspace(source)
            archive = pack(root, "demo")
            manifest = unpack(archive, Path(destination), "demo")
            self.assertIn("assets/projects/demo/unused-reference.svg", manifest["files"])
            for name in manifest["files"]:
                self.assertEqual((root / name).read_bytes(), (Path(destination) / name).read_bytes())
            self.assertEqual(archive, pack(root, "demo"))

    def test_caches_and_private_files_are_excluded(self):
        with tempfile.TemporaryDirectory() as source:
            root, project = self.workspace(source)
            for name in [".env", "credentials.json", "private.key", "oauth-token.json", "audio/voice.wav", "output/video.mp4", "__pycache__/cached.pyc", ".r2-source.json"]:
                path = project / name
                path.parent.mkdir(exist_ok=True)
                path.write_bytes(b"private or generated")
            with ZipFile(io.BytesIO(pack(root, "demo"))) as archive:
                self.assertEqual(len(json.loads(archive.read("manifest.json"))["files"]), 6)

    def test_embedded_json_credentials_fail_without_exposing_values(self):
        with tempfile.TemporaryDirectory() as source:
            root, project = self.workspace(source)
            (project / "configuration.json").write_text(json.dumps({"client_secret": "sensitive fixture"}))
            with self.assertRaises(ValueError) as error:
                pack(root, "demo")
            self.assertNotIn("sensitive fixture", str(error.exception))

    def test_source_symlinks_and_explicit_outside_assets_are_rejected(self):
        with tempfile.TemporaryDirectory() as source:
            root, project = self.workspace(source)
            (project / "link.txt").symlink_to(root / "assets/projects/demo/photo.png")
            with self.assertRaisesRegex(ValueError, "symlink"):
                pack(root, "demo")
            (project / "link.txt").unlink()
            (project / "publication.json").write_text(json.dumps({"source_assets": ["../outside"]}))
            with self.assertRaises(ValueError):
                pack(root, "demo")

    def test_local_edits_or_asset_collisions_are_preserved_before_any_install(self):
        for collision in ["projects/demo/content.json", "assets/projects/demo/photo.png"]:
            with self.subTest(collision=collision), tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as destination:
                root, _ = self.workspace(source)
                target = Path(destination) / collision
                target.parent.mkdir(parents=True)
                target.write_bytes(b"local edits")
                with self.assertRaisesRegex(ValueError, "Local edits preserved"):
                    unpack(pack(root, "demo"), Path(destination), "demo")
                self.assertEqual(target.read_bytes(), b"local edits")
                self.assertFalse((Path(destination) / "projects/demo/brief.md").exists())

    def test_restoration_rejects_traversal_other_projects_core_files_and_bad_hashes(self):
        def rename(files, manifest, name):
            original = "projects/demo/brief.md"
            files[name] = files.pop(original)
            manifest["files"][name] = manifest["files"].pop(original)
        for name in ["projects/demo/../../outside.txt", "projects/other/brief.md", "src/davinci_creator/cli.py", "assets/brand/logo.png"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as destination:
                root, _ = self.workspace(source)
                archive = self.rewrite(pack(root, "demo"), lambda files, manifest: rename(files, manifest, name))
                with self.assertRaises(ValueError):
                    unpack(archive, Path(destination), "demo")
                self.assertEqual(list(Path(destination).iterdir()), [])
        with tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as destination:
            root, _ = self.workspace(source)
            archive = self.rewrite(pack(root, "demo"), lambda files, manifest: files.update({"projects/demo/brief.md": b"modified"}))
            with self.assertRaisesRegex(ValueError, "checksum|metadata"):
                unpack(archive, Path(destination), "demo")

    def test_existing_destination_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as destination, tempfile.TemporaryDirectory() as outside:
            root, _ = self.workspace(source)
            (Path(destination) / "projects").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "symlink|escapes"):
                unpack(pack(root, "demo"), Path(destination), "demo")
            self.assertEqual(list(Path(outside).iterdir()), [])

    def test_push_pull_and_version_history_preserve_old_sources(self):
        with tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as destination:
            root, project = self.workspace(source)
            store = MemoryStorage()
            first = push(root, "demo", store)
            (project / "brief.md").write_text("Updated brief")
            second = push(root, "demo", store)
            self.assertEqual(second["versions"], [first["sha256"], second["sha256"]])
            pull(Path(destination), "demo", store, first["sha256"])
            self.assertEqual((Path(destination) / "projects/demo/brief.md").read_text(), "Editable brief")
            with self.assertRaisesRegex(ValueError, "Remote sources have changed"):
                push(Path(destination), "demo", store)

    def test_corrupt_remote_archive_does_not_replace_catalog(self):
        with tempfile.TemporaryDirectory() as source:
            root, _ = self.workspace(source)
            store = MemoryStorage()
            store.corrupt = True
            with self.assertRaisesRegex(ValueError, "verification failed"):
                push(root, "demo", store)
            self.assertNotIn(INDEX, store.objects)

    def test_concurrent_catalog_change_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as source:
            root, _ = self.workspace(source)
            store = MemoryStorage()
            store.concurrent = True
            with self.assertRaisesRegex(ValueError, "catalog changed"):
                push(root, "demo", store)
            self.assertTrue(json.loads(store.objects[INDEX])["other_update"])

    def test_bad_catalog_or_archive_digest_does_not_restore(self):
        with tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as destination:
            root, _ = self.workspace(source)
            store = MemoryStorage()
            push(root, "demo", store)
            store.corrupt = True
            with self.assertRaisesRegex(ValueError, "checksum"):
                pull(Path(destination), "demo", store)
            self.assertEqual(list(Path(destination).iterdir()), [])
            store.objects[INDEX] = b'{"version": 2, "projects": {}}'
            with self.assertRaises(ValueError):
                read_index(store)


if __name__ == "__main__":
    unittest.main()
