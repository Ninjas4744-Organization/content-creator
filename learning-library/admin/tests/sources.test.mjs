import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SourcesStore } from "../server/sources.mjs";
import { initialSourceState, validateSourceDocument } from "../server/sources-domain.mjs";

const album = {
	id: "team-work",
	title: "עבודת צוות",
	url: "https://photos.app.goo.gl/abc123",
	context: "דוגמאות לשיתוף פעולה",
	tags: ["רובוטיקה"],
	enabled: true,
};
async function fixture(t) {
	const directory = await mkdtemp(join(tmpdir(), "davinci-sources-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const file = join(directory, "sources.json");
	return { store: new SourcesStore(file), file };
}
test("source seeds match the existing albums; edits, disabled sources and deletion are recoverable", async (t) => {
	const { store, file } = await fixture(t);
	const initial = await store.read();
	assert.equal(initial.document.albums.length, 3);
	const created = await store.change("0", { type: "create", album });
	const edited = await store.change("1", {
		type: "update",
		album: { ...album, context: "הקשר מעודכן", enabled: false },
	});
	assert.equal(edited.document.albums.at(-1).enabled, false);
	await store.change("2", { type: "delete", id: album.id });
	const restored = await store.change("3", {
		type: "restore",
		id: (await store.read()).history[0].id,
	});
	assert.deepEqual(restored.document.albums, edited.document.albums);
	assert.equal(restored.history.length, 4);
	assert.deepEqual((await new SourcesStore(file).read()).document, restored.document);
	assert.deepEqual(
		JSON.parse(await readFile(file, "utf8")).history.at(-1).document,
		initial.document,
	);
	assert.deepEqual(created.document.albums.at(-1), album);
});
test("sources reject stale/missing revisions, serialize concurrent mutations and retain unknown metadata", async (t) => {
	const { store } = await fixture(t);
	const state = initialSourceState();
	state.document.future = { retained: true };
	state.document.albums[0].credit = "team";
	await store.storage.write(state);
	const original = state.document.albums[0];
	const results = await Promise.allSettled([
		store.change("0", { type: "update", album: { ...original, context: "עדכון" } }),
		store.change("0", { type: "delete", id: original.id }),
	]);
	assert.deepEqual(
		results.map((result) => result.status),
		["fulfilled", "rejected"],
	);
	assert.equal(results[1].reason.status, 409);
	await assert.rejects(store.change(undefined, { type: "create", album }), { status: 409 });
	const current = await store.read();
	assert.deepEqual(current.document.future, { retained: true });
	assert.equal(current.document.albums[0].credit, "team");
	for (let i = 0; i < 35; i++)
		await store.change(String(i + 1), {
			type: "update",
			album: { ...original, context: String(i) },
		});
	assert.equal((await store.read()).history.length, 30);
});
test("source validation accepts shared Google links and rejects unsafe URLs and malformed metadata", () => {
	for (const url of [
		"https://photos.app.goo.gl/Abc123",
		"https://photos.google.com/share/abc_DEF?key=shared-key",
	])
		assert.equal(
			validateSourceDocument({ version: 1, albums: [{ ...album, url }] }).albums[0].url,
			url,
		);
	for (const url of [
		"javascript:alert(1)",
		"http://photos.app.goo.gl/abc",
		"https://photos.app.goo.gl.evil.test/abc",
		"https://user@photos.app.goo.gl/abc",
		"https://photos.google.com/other",
		"https://photos.app.goo.gl:8443/abc",
		"https://photos.app.goo.gl/abc#fragment",
		"https://photos.app.goo.gl/abc\\evil",
	])
		assert.throws(() => validateSourceDocument({ version: 1, albums: [{ ...album, url }] }));
	for (const fields of [
		{ title: " " },
		{ id: "../unsafe" },
		{ context: "x".repeat(2001) },
		{ tags: [false] },
		{ enabled: "true" },
		{ enabled: null },
		{ tags: null },
	])
		assert.throws(() =>
			validateSourceDocument({ version: 1, albums: [{ ...album, ...fields }] }),
		);
	assert.throws(() => validateSourceDocument({ version: 1, albums: [album, album] }));
	assert.throws(() =>
		validateSourceDocument({ version: 1, albums: [], future: "x".repeat(256 * 1024) }),
	);
});

test("album creation generates a stable ID when the user supplies a name and link", async (t) => {
	const { store } = await fixture(t);
	const { id, ...input } = album;
	const created = await store.change("0", { type: "create", album: input });
	const saved = created.document.albums.at(-1);
	assert.match(saved.id, /^album-[a-f0-9-]{36}$/);
	const edited = await store.change("1", {
		type: "update",
		album: { ...saved, title: "שם חדש" },
	});
	assert.equal(edited.document.albums.at(-1).id, saved.id);
});
