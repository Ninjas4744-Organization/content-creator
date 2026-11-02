import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { autorun } from "mobx";
import { CatalogStore } from "../src/features/catalog/CatalogStore";
import {
	itemGallery,
	type GalleryMutation,
	type CatalogInput,
	type ImportMode,
} from "../src/models/catalog";
import { galleryUrl, itemUrl } from "../src/ui/browserMedia";
import { EditorStore } from "../src/features/editor/EditorStore";
import { parseImport } from "../src/core/catalogImport";
import type {
	CatalogRepository,
	CatalogRevision,
	CatalogSnapshot,
	HistoryEntry,
	LearningItem,
} from "../src/models/catalog";

const catalog: LearningItem[] = JSON.parse(
	readFileSync(join(__dirname, "../fixtures/catalog.json"), "utf8"),
);
class MemoryRepository implements CatalogRepository {
	snapshot: CatalogSnapshot = {
		revision: 0,
		updatedAt: null,
		items: structuredClone(catalog),
		galleries: [
			{ id: "public", name: "ספרייה ציבורית", url: "/" },
			{ id: "team", name: "ספריית הקבוצה", url: "/team-library" },
			{ id: "study", name: "למידה למבחנים", url: "/study-library" },
			{ id: "none", name: "בקישור בלבד", url: "/" },
		],
	};
	failSave = false;
	load = async () => structuredClone(this.snapshot);
	save = async (items: LearningItem[], revision: CatalogRevision): Promise<CatalogSnapshot> => {
		if (this.failSave || revision !== this.snapshot.revision)
			throw new Error("הקטלוג עודכן בחלון אחר.");
		this.snapshot = {
			...this.snapshot,
			items: structuredClone(items),
			revision: Number(revision) + 1,
			updatedAt: new Date().toISOString(),
		};
		return this.load();
	};
	changeGallery = async (
		change: GalleryMutation,
		revision: CatalogRevision,
	): Promise<CatalogSnapshot> => {
		const snapshot = await this.load();
		if (change.type === "create")
			snapshot.galleries.push({
				id: "gallery-custom",
				name: change.name,
				url: change.url ?? "/",
			});
		else if (change.type === "rename" || change.type === "update")
			snapshot.galleries = snapshot.galleries.map((gallery) =>
				gallery.id === change.id
					? {
							...gallery,
							name: change.name,
							url: change.type === "update" ? change.url : gallery.url,
						}
					: gallery,
			);
		else {
			snapshot.galleries = snapshot.galleries.filter((gallery) => gallery.id !== change.id);
			snapshot.items = snapshot.items.map((item) =>
				itemGallery(item) === change.id
					? { ...item, gallery: "none", unlisted: true }
					: item,
			);
		}
		const saved = await this.save(snapshot.items, revision);
		this.snapshot = { ...saved, galleries: snapshot.galleries };
		return this.load();
	};
	importCatalog = async (input: CatalogInput, mode: ImportMode) => {
		const snapshot = await this.load();
		const incoming = Array.isArray(input) ? input : input.items;
		const galleries = new Map(snapshot.galleries.map((gallery) => [gallery.id, gallery]));
		if (!Array.isArray(input))
			for (const gallery of input.galleries)
				if (mode !== "merge" || !galleries.has(gallery.id))
					galleries.set(gallery.id, gallery);
		const items = new Map(snapshot.items.map((item) => [item.id, item]));
		for (const item of incoming)
			if (mode !== "merge" || !items.has(item.id))
				items.set(
					item.id,
					galleries.has(itemGallery(item))
						? item
						: { ...item, gallery: "none", unlisted: true },
				);
		const saved = await this.save(
			mode === "replace" ? incoming : [...items.values()],
			this.snapshot.revision,
		);
		this.snapshot = {
			...saved,
			galleries:
				mode === "replace" && !Array.isArray(input)
					? input.galleries
					: [...galleries.values()],
		};
		return this.load();
	};
	history = async (): Promise<HistoryEntry[]> => [];
	restore = async (): Promise<CatalogSnapshot> => this.load();
	source = async () => ({
		schemaVersion: 1 as const,
		items: structuredClone(catalog),
		galleries: this.snapshot.galleries,
	});
	dispose() {}
}

test("MobX filters retain the library's legacy galleries and search all query words", async () => {
	const store = new CatalogStore(new MemoryRepository());
	await store.load();
	store.setView("study");
	store.setQuery("כוחות פיזיקה");
	assert.deepEqual(
		store.visibleItems.map((item) => item.id),
		["physics-forces-exam"],
	);
	store.setView("team");
	store.setQuery("");
	assert.ok(store.visibleItems.some((item) => item.id === "recruitment"));
	store.setView("none");
	assert.deepEqual(
		store.visibleItems.map((item) => item.id),
		["finance-snapshot-2026-11"],
	);
});

test("saving updates observable state and preserves untouched media and unknown metadata", async () => {
	const repository = new MemoryRepository();
	const store = new CatalogStore(repository);
	await store.load();
	const item = store.items[0]!;
	const revisions: CatalogRevision[] = [];
	const stop = autorun(() => {
		revisions.push(store.revision);
	});
	assert.equal(
		await store.saveItem(
			{ ...item, title: "שם חדש", customMetadata: { retained: true } },
			item.id,
		),
		true,
	);
	stop();
	assert.deepEqual(revisions, [0, 1]);
	assert.equal(store.items[0]!.title, "שם חדש");
	assert.deepEqual(store.items[0]!.scorm, item.scorm);
	assert.deepEqual(store.items[0]!.customMetadata, { retained: true });
	assert.equal(store.saving, false);
});

test("a rejected concurrent save keeps the local snapshot and exposes the error", async () => {
	const repository = new MemoryRepository();
	const store = new CatalogStore(repository);
	await store.load();
	const before = store.items;
	repository.failSave = true;
	assert.equal(await store.toggleFeatured(before[0]!.id), false);
	assert.equal(store.items, before);
	assert.equal(store.revision, 0);
	assert.match(store.error!, /חלון אחר/);
	assert.equal(store.saving, false);
});

test("bulk visibility updates only selected entries and preserves direct-link records", async () => {
	const store = new CatalogStore(new MemoryRepository());
	await store.load();
	const id = store.items[0]!.id;
	store.toggleSelection(id);
	assert.equal(await store.moveSelected("study"), true);
	assert.equal(store.items.find((item) => item.id === id)!.gallery, "study");
	assert.equal(store.items.find((item) => item.id === id)!.unlisted, true);
	assert.equal(
		store.items.find((item) => item.id === "finance-snapshot-2026-11")!.gallery,
		"none",
	);
	assert.equal(store.selected.length, 0);
});

test("imports merge by ID and preserve local edits unless overwrite is chosen", async () => {
	const store = new CatalogStore(new MemoryRepository());
	await store.load();
	const original = store.items[0]!;
	const updated = { ...original, title: "updated source" };
	const added = { ...original, id: "new-item" };
	await store.importItems([updated, added], false);
	assert.equal(store.items[0]!.title, original.title);
	assert.equal(store.items.at(-1)!.id, "new-item");
	await store.importItems([updated], true);
	assert.equal(store.items[0]!.title, "updated source");
	assert.equal(store.items.length, catalog.length + 1);
	assert.throws(() => parseImport([original, original]));
});

test("editor keeps unknown metadata and media while tracking unsaved changes", () => {
	const item = { ...catalog[0]!, futureMetadata: { retained: true } };
	const editor = new EditorStore();
	editor.edit(item);
	assert.equal(editor.dirty, false);
	editor.setField("title", "כותרת חדשה");
	assert.equal(editor.dirty, true);
	const result = editor.toItem();
	assert.deepEqual(result.futureMetadata, item.futureMetadata);
	assert.deepEqual(result.scorm, item.scorm);
	assert.equal(result.poster, item.poster);
	assert.equal(result.video, item.video);
	assert.equal(result.title, "כותרת חדשה");
});

test("a disposed route ignores a late catalog response", async () => {
	const repository = new MemoryRepository();
	let complete!: (snapshot: CatalogSnapshot) => void;
	repository.load = () =>
		new Promise((resolve) => {
			complete = resolve;
		});
	const store = new CatalogStore(repository);
	const pending = store.load();
	store.dispose();
	complete(repository.snapshot);
	await pending;
	assert.equal(store.items.length, 0);
});

test("custom galleries update observable labels, filters, editor and bulk assignment", async () => {
	const store = new CatalogStore(new MemoryRepository());
	await store.load();
	assert.equal(await store.changeGallery({ type: "create", name: "הדרכות" }), true);
	const custom = store.galleries.at(-1)!;
	const id = store.items[0]!.id;
	store.toggleSelection(id);
	await store.moveSelected(custom.id);
	store.setView(custom.id);
	assert.equal(store.viewName, "הדרכות");
	assert.deepEqual(
		store.visibleItems.map((item) => item.id),
		[id],
	);
	await store.changeGallery({ type: "rename", id: custom.id, name: "הדרכות חדשות" });
	assert.equal(store.viewName, "הדרכות חדשות");
	assert.equal(store.items[0]!.gallery, custom.id);
	const editor = new EditorStore();
	editor.edit(store.items[0]);
	assert.equal(editor.toItem().gallery, custom.id);
	assert.doesNotMatch(itemUrl(editor.toItem(), store.galleries), /undefined/);
});

test("deleting a visible gallery clears stale filters and fixed galleries cannot change", async () => {
	const repository = new MemoryRepository();
	const store = new CatalogStore(repository);
	await store.load();
	store.setView("team");
	store.setGallery("team");
	const teamIds = store.visibleItems.map((item) => item.id);
	assert.equal(await store.changeGallery({ type: "delete", id: "team" }), true);
	assert.equal(store.view, "all");
	assert.equal(store.gallery, "all");
	assert.ok(
		store.items
			.filter((item) => teamIds.includes(item.id))
			.every((item) => item.gallery === "none"),
	);
	const before = repository.snapshot;
	assert.equal(await store.changeGallery({ type: "delete", id: "public" }), false);
	assert.equal(await store.changeGallery({ type: "rename", id: "none", name: "אחר" }), false);
	assert.equal(repository.snapshot, before);
	// An import of legacy team content cannot resurrect a deleted library.
	const legacy = {
		...catalog.find((item) => item.unlisted && !item.gallery)!,
		id: "legacy-import",
	};
	assert.equal(await store.importItems([legacy], false), true);
	assert.equal(store.items.at(-1)!.gallery, "none");
	assert.ok(!store.galleries.some((gallery) => gallery.id === "team"));
});

test("a rejected gallery save retains both galleries and assignments", async () => {
	const repository = new MemoryRepository();
	const store = new CatalogStore(repository);
	await store.load();
	const items = store.items;
	const galleries = store.galleries;
	repository.failSave = true;
	assert.equal(await store.changeGallery({ type: "delete", id: "team" }), false);
	assert.equal(store.items, items);
	assert.equal(store.galleries, galleries);
	assert.equal(store.revision, 0);
	assert.match(store.error!, /חלון אחר/);
});

test("editing a library destination updates item links while keeping IDs, filters, and content intact", async () => {
	const store = new CatalogStore(new MemoryRepository());
	await store.load();
	store.setView("team");
	const item = store.visibleItems[0]!;
	const before = store.items;
	const destinations: string[] = [];
	const stop = autorun(() => destinations.push(itemUrl(item, store.galleries)));
	assert.equal(
		await store.changeGallery({
			type: "update",
			id: "team",
			name: "ספריית הקבוצה",
			url: "/robotics?language=he#lessons",
		}),
		true,
	);
	stop();
	assert.equal(destinations.length, 2);
	const destination = new URL(destinations[1]!);
	assert.equal(destination.origin, "https://knowledge.davinci4744.com");
	assert.equal(destination.pathname, "/robotics");
	assert.equal(destination.searchParams.get("language"), "he");
	assert.equal(destination.searchParams.get("item"), item.id);
	assert.equal(destination.searchParams.get("view"), "deck");
	assert.equal(destination.hash, "#lessons");
	assert.equal(store.view, "team");
	assert.deepEqual(store.items, before);
	assert.equal(
		await store.changeGallery({
			type: "update",
			id: "public",
			name: "ספרייה ציבורית",
			url: "/other",
		}),
		false,
	);
});

test("item links use external library URLs, retain legacy destinations, and reject executable schemes", () => {
	const galleries = new MemoryRepository().snapshot.galleries;
	for (const [item, expected] of [
		[{ ...catalog[0]!, gallery: "public" }, "/"],
		[{ ...catalog[0]!, gallery: undefined, unlisted: true }, "/team-library"],
		[{ ...catalog[0]!, gallery: "study" }, "/study-library"],
		[{ ...catalog[0]!, gallery: "none" }, "/"],
	] as const)
		assert.equal(new URL(itemUrl(item, galleries)).pathname, expected);
	const external = {
		id: "external",
		name: "הדרכות",
		url: "https://courses.example.org/learning?item=old&view=deck&lang=he#intro",
	};
	const item = { ...catalog[0]!, id: "video-item", gallery: external.id, deck: null };
	const destination = new URL(itemUrl(item, [external]));
	assert.equal(destination.origin, "https://courses.example.org");
	assert.equal(destination.pathname, "/learning");
	assert.equal(destination.searchParams.get("item"), "video-item");
	assert.equal(destination.searchParams.getAll("item").length, 1);
	assert.equal(destination.searchParams.get("view"), "video");
	assert.equal(destination.searchParams.get("lang"), "he");
	assert.equal(destination.hash, "#intro");
	for (const url of [
		"javascript:alert(1)",
		"data:text/html,test",
		"https://user:secret@example.org",
		"http://[",
	])
		assert.equal(galleryUrl({ url }), "https://knowledge.davinci4744.com/");
});

test("document import parsing keeps library URLs and metadata and rejects a nested items document", () => {
	const document = {
		schemaVersion: 1 as const,
		galleries: new MemoryRepository().snapshot.galleries,
		items: catalog,
		custom: { retained: true },
	};
	assert.deepEqual(parseImport(document), document);
	assert.throws(() => parseImport({ ...document, items: document }));
	assert.throws(() => parseImport({ ...document, schemaVersion: 2 }));
});

test("production saves retain R2 etags and identify successful publication in the UI", async () => {
	const repository = new MemoryRepository();
	repository.snapshot = {
		...repository.snapshot,
		mode: "production",
		revision: "r2-etag-before",
	};
	let received: CatalogRevision | undefined;
	repository.save = async (items, revision) => {
		received = revision;
		return { ...repository.snapshot, items, revision: "r2-etag-after" };
	};
	const store = new CatalogStore(repository);
	await store.load();
	assert.equal(store.production, true);
	assert.match(store.workspaceLabel, /באתר/);
	const item = store.items[0]!;
	assert.equal(await store.saveItem({ ...item, title: "Published title" }, item.id), true);
	assert.equal(received, "r2-etag-before");
	assert.equal(store.revision, "r2-etag-after");
	assert.match(store.message!, /באתר/);
});
