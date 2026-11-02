import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CatalogStore,
	documentOf,
	validateCatalog,
	validateGalleries,
	defaultGalleries,
	galleryOf,
} from "../server/catalog.mjs";

const seed = new URL("../fixtures/catalog.json", import.meta.url);
const catalog = JSON.parse(await readFile(seed, "utf8"));
async function workspace(t) {
	const directory = await mkdtemp(join(tmpdir(), "davinci-admin-test-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	return new CatalogStore(join(directory, "workspace.json"), seed);
}

test("accepts the real catalog and keeps legacy gallery behavior and unknown metadata", () => {
	const input = [{ ...catalog[0], futureField: { retained: true } }];
	assert.deepEqual(validateCatalog(input), input);
	assert.equal(galleryOf({ unlisted: true }), "team");
	assert.equal(galleryOf({ unlisted: false }), "public");
	assert.equal(galleryOf({ unlisted: true, gallery: "study" }), "study");
	assert.equal(galleryOf({ unlisted: true, gallery: "none" }), "none");
});

test("rejects malformed catalogs, duplicate IDs, unsafe paths, and invalid media metadata", () => {
	for (const value of [
		null,
		{},
		[catalog[0], catalog[0]],
		[{ ...catalog[0], title: "" }],
		[{ ...catalog[0], gallery: "private" }],
		[{ ...catalog[0], id: "../escape" }],
		[{ ...catalog[0], poster: "javascript:alert(1)" }],
		[{ ...catalog[0], deck: "library/media/../private/key.json" }],
		[{ ...catalog[0], slides: -1 }],
		[{ ...catalog[0], duration: Infinity }],
		[{ ...catalog[0], chapters: [7] }],
		[{ ...catalog[0], scorm: { deck: "https://external.example/lesson.zip" } }],
	])
		assert.throws(() => validateCatalog(value));
});

test("saves survive restarting the store and retain an undo snapshot", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	const items = structuredClone(before.items);
	items[0].title = "כותרת חדשה";
	items[0].futureMetadata = "preserved";
	await store.mutate("0", items, "עריכת תוכן");
	const reopened = new CatalogStore(store.file, seed);
	const result = await reopened.read();
	assert.equal(result.revision, 1);
	assert.equal(result.items[0].title, "כותרת חדשה");
	assert.equal(result.items[0].futureMetadata, "preserved");
	assert.deepEqual(result.items[0].scorm, before.items[0].scorm);
	assert.deepEqual(result.history[0].items, before.items);
	const restored = await reopened.mutate("1", null, null, result.history[0].id);
	assert.deepEqual(restored.items, before.items);
	assert.equal(restored.revision, 2);
	assert.equal(restored.history[0].items[0].title, "כותרת חדשה");
});

test("simultaneous editors cannot silently overwrite one another", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	const first = structuredClone(before.items);
	const second = structuredClone(before.items);
	first[0].title = "first editor";
	second[0].title = "second editor";
	const results = await Promise.allSettled([
		store.mutate("0", first, "first"),
		store.mutate("0", second, "second"),
	]);
	assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
	const conflict = results.find((result) => result.status === "rejected");
	assert.equal(conflict.reason.status, 409);
	assert.equal((await store.read()).items[0].title, "first editor");
});

test("invalid writes leave the stored catalog unchanged and do not block subsequent saves", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	await assert.rejects(store.mutate("0", [{}], "invalid"));
	assert.deepEqual(await store.read(), before);
	await store.mutate("0", before.items, "valid");
	assert.equal((await store.read()).revision, 1);
});

test("history is bounded at 30 recoverable snapshots", async (t) => {
	const store = await workspace(t);
	const items = (await store.read()).items;
	for (let index = 0; index < 33; index++)
		await store.mutate(String(index), items, `change ${index}`);
	const result = await store.read();
	assert.equal(result.history.length, 30);
	assert.equal(result.history[0].revision, 32);
	assert.equal(result.history.at(-1).revision, 3);
});

test("gallery creation, rename, assignment, deletion and restore preserve catalog data", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	const created = await store.mutateGallery("0", { type: "create", name: "  הדרכות  " });
	const custom = created.galleries.at(-1);
	assert.match(custom.id, /^gallery-/);
	assert.equal(custom.name, "הדרכות");
	const assigned = await store.mutate(
		"1",
		before.items.map((item, index) =>
			index === 0
				? { ...item, gallery: custom.id, unlisted: true, extra: { preserved: true } }
				: item,
		),
		"assignment",
	);
	const renamed = await store.mutateGallery("2", {
		type: "rename",
		id: custom.id,
		name: "הדרכות חדשות",
	});
	assert.equal(renamed.galleries.at(-1).id, custom.id);
	assert.deepEqual(renamed.items, assigned.items);
	const deleted = await store.mutateGallery("3", { type: "delete", id: custom.id });
	assert.equal(deleted.items.length, before.items.length);
	assert.deepEqual(deleted.items[0], { ...assigned.items[0], gallery: "none", unlisted: true });
	assert.ok(!deleted.galleries.some((gallery) => gallery.id === custom.id));
	assert.deepEqual(deleted.items.slice(1), before.items.slice(1));
	const reopened = new CatalogStore(store.file, seed);
	assert.deepEqual((await reopened.read()).galleries, deleted.galleries);
	const restored = await reopened.mutate("4", null, null, deleted.history[0].id);
	assert.deepEqual(restored.galleries, renamed.galleries);
	assert.deepEqual(restored.items, assigned.items);
});

test("deleting team migrates explicit and legacy unlisted items, and survives later saves", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	assert.ok(before.items.some((item) => !item.gallery && item.unlisted));
	assert.ok(before.items.some((item) => item.gallery === "team"));
	const next = await store.mutateGallery("0", { type: "delete", id: "team" });
	for (let index = 0; index < before.items.length; index++)
		assert.deepEqual(
			next.items[index],
			galleryOf(before.items[index]) === "team"
				? { ...before.items[index], gallery: "none", unlisted: true }
				: before.items[index],
		);
	const saved = await store.mutate("1", next.items, "later edit");
	assert.ok(!saved.galleries.some((gallery) => gallery.id === "team"));
	const restored = await store.mutate("2", null, null, saved.history[1].id);
	assert.deepEqual(restored.galleries, before.galleries);
	assert.deepEqual(restored.items, before.items);
});

test("gallery validation protects fixed libraries, rejects invalid or duplicate names and unknown references", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	for (const input of [
		{ type: "delete", id: "public" },
		{ type: "delete", id: "none" },
		{ type: "rename", id: "public", name: "שינוי" },
		{ type: "rename", id: "none", name: "שינוי" },
		{ type: "create", name: " " },
		{ type: "create", name: "א".repeat(101) },
		{ type: "create", name: "ספריית הקבוצה" },
		{ type: "rename", id: "team", name: "למידה למבחנים" },
		{ type: "rename", id: "team", name: null },
		{ type: "delete", id: "missing" },
		{ type: "unknown" },
	])
		await assert.rejects(store.mutateGallery("0", input));
	assert.deepEqual(await store.read(), before);
	assert.throws(() =>
		validateGalleries(defaultGalleries.filter((gallery) => gallery.id !== "public")),
	);
	assert.throws(() =>
		validateGalleries(
			defaultGalleries.map((gallery) =>
				gallery.id === "none" ? { ...gallery, name: "אחר" } : gallery,
			),
		),
	);
	assert.throws(() =>
		validateCatalog([{ ...before.items[0], gallery: "gallery-missing" }], before.galleries),
	);
	await store.mutateGallery("0", { type: "rename", id: "team", name: "צוות" });
	assert.equal(
		(await store.read()).galleries.find((gallery) => gallery.id === "team").name,
		"צוות",
	);
});

test("gallery mutations and content saves share revision checks and serialization", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	const results = await Promise.allSettled([
		store.mutateGallery("0", { type: "delete", id: "study" }),
		store.mutate("0", before.items, "stale content save"),
	]);
	assert.equal(results[0].status, "fulfilled");
	assert.equal(results[1].reason.status, 409);
	const after = await store.read();
	await assert.rejects(store.mutate("1", before.items, "stale gallery reference"));
	assert.deepEqual(await store.read(), after);
});

test("old workspaces and history without gallery definitions migrate on read and restore", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	await writeFile(
		store.file,
		JSON.stringify({
			revision: 7,
			updatedAt: null,
			items: before.items,
			history: [
				{
					id: "legacy",
					at: new Date().toISOString(),
					revision: 6,
					action: "legacy",
					items: before.items,
				},
			],
		}),
	);
	assert.deepEqual((await store.read()).galleries, defaultGalleries);
	await store.mutateGallery("7", { type: "delete", id: "team" });
	const restored = await store.mutate("8", null, null, "legacy");
	assert.deepEqual(restored.items, before.items);
	assert.deepEqual(restored.galleries, defaultGalleries);
});

test("library URLs persist with stable IDs, validate on both create and update, and restore with history", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	for (const url of [
		null,
		"",
		" ",
		"javascript:alert(1)",
		"data:text/html,test",
		"ftp://example.org",
		"//example.org",
		"https://user:secret@example.org",
		"https://",
		"https://[",
		"relative-path",
		"/bad\\path",
		"/bad path",
		"/bad\npath",
		"/" + "a".repeat(2000),
	]) {
		await assert.rejects(
			store.mutateGallery("0", { type: "update", id: "team", name: "ספריית הקבוצה", url }),
		);
		await assert.rejects(store.mutateGallery("0", { type: "create", name: "חדשה", url }));
	}
	for (const id of ["public", "none"])
		await assert.rejects(
			store.mutateGallery("0", {
				type: "update",
				id,
				name: before.galleries.find((gallery) => gallery.id === id).name,
				url: "/new",
			}),
		);
	assert.deepEqual(await store.read(), before);
	const changed = await store.mutateGallery("0", {
		type: "update",
		id: "team",
		name: "ספריית הצוות",
		url: "  /robotics?lang=he#lessons  ",
	});
	assert.equal(
		changed.galleries.find((gallery) => gallery.id === "team").url,
		"/robotics?lang=he#lessons",
	);
	assert.deepEqual(changed.items, before.items);
	const created = await store.mutateGallery("1", {
		type: "create",
		name: "חיצונית",
		url: "https://courses.example.org/learning",
	});
	assert.equal(created.galleries.at(-1).url, "https://courses.example.org/learning");
	const reopened = new CatalogStore(store.file, seed);
	assert.deepEqual((await reopened.read()).galleries, created.galleries);
	await assert.rejects(
		reopened.mutateGallery("1", {
			type: "update",
			id: "team",
			name: "ספריית הצוות",
			url: "/stale",
		}),
		{ status: 409 },
	);
	const restored = await reopened.mutate("2", null, null, created.history[1].id);
	assert.deepEqual(restored.galleries, before.galleries);
	assert.deepEqual(restored.items, before.items);
});

test("existing library definitions and saved history receive their original destination URLs", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	const legacy = [
		...before.galleries.map(({ url, ...gallery }) => gallery),
		{ id: "custom-old", name: "קיימת" },
	];
	await writeFile(
		store.file,
		JSON.stringify({
			revision: 4,
			updatedAt: null,
			items: before.items,
			galleries: legacy,
			history: [
				{
					id: "old-urls",
					at: new Date().toISOString(),
					revision: 3,
					action: "legacy",
					items: before.items,
					galleries: legacy,
				},
			],
		}),
	);
	const migrated = await store.read();
	assert.deepEqual(migrated.galleries.slice(0, 4), defaultGalleries);
	assert.equal(migrated.galleries.at(-1).url, "/");
	await store.mutateGallery("4", {
		type: "update",
		id: "team",
		name: "ספריית הקבוצה",
		url: "/new-team",
	});
	const restored = await store.mutate("5", null, null, "old-urls");
	assert.deepEqual(restored.galleries, migrated.galleries);
});

test("shared document replacement round-trips libraries, URLs and unknown metadata through history", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	const galleries = [
		defaultGalleries[0],
		defaultGalleries[3],
		{
			id: "robotics",
			name: "רובוטיקה",
			url: "/robotics",
			customLibraryMetadata: { retained: true },
		},
	];
	const document = {
		schemaVersion: 1,
		galleries,
		items: [{ ...before.items[0], gallery: "robotics", customMetadata: { retained: true } }],
		customCatalogMetadata: { retained: true },
	};
	const imported = await store.importCatalog("0", document, "replace");
	assert.deepEqual(documentOf(imported), document);
	const edited = await store.mutateGallery("1", {
		type: "update",
		id: "robotics",
		name: "הדרכות רובוטיקה",
		url: "/training/robotics",
	});
	assert.deepEqual(documentOf(edited).customCatalogMetadata, document.customCatalogMetadata);
	assert.deepEqual(edited.galleries.at(-1).customLibraryMetadata, { retained: true });
	const restored = await store.mutate("2", null, null, edited.history[0].id);
	assert.deepEqual(documentOf(restored), document);
	const reopened = new CatalogStore(store.file, seed);
	assert.deepEqual(documentOf(await reopened.read()), document);
});

test("document import modes preserve local edits or explicitly update both items and library destinations", async (t) => {
	const store = await workspace(t);
	const before = await store.read();
	const incoming = {
		schemaVersion: 1,
		items: [{ ...before.items[0], title: "Imported" }],
		galleries: before.galleries.map((gallery) =>
			gallery.id === "team" ? { ...gallery, name: "צוות", url: "/crew" } : gallery,
		),
	};
	let state = await store.importCatalog("0", incoming, "merge");
	assert.equal(state.items[0].title, before.items[0].title);
	assert.equal(state.galleries.find((gallery) => gallery.id === "team").url, "/team-library");
	state = await store.importCatalog("1", incoming, "overwrite");
	assert.equal(state.items[0].title, "Imported");
	assert.equal(state.galleries.find((gallery) => gallery.id === "team").url, "/crew");
	assert.equal(state.items.length, before.items.length);
	await assert.rejects(store.importCatalog("1", incoming, "replace"), { status: 409 });
	for (const catalog of [
		{ ...incoming, schemaVersion: 2 },
		{ ...incoming, galleries: [] },
		{ ...incoming, items: [{ ...incoming.items[0], gallery: "missing" }] },
	])
		await assert.rejects(store.importCatalog("2", catalog, "replace"));
	assert.deepEqual(await store.read(), state);
});
