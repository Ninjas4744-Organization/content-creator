import { test } from "node:test";
import assert from "node:assert/strict";
import { autorun } from "mobx";
import { SourcesStore } from "../src/features/sources/SourcesStore";
import { sourcePrompt } from "../src/features/sources/sourcePrompt";
import type { SourcesRepository, SourceSnapshot } from "../src/models/sources";
import { defaultBackgrounds } from "../server/background-assets.mjs";

const snapshot: SourceSnapshot = {
	version: 1,
	revision: 0,
	updatedAt: null,
	mode: "local",
	backgrounds: structuredClone(defaultBackgrounds),
	albums: [
		{
			id: "team",
			title: "הקבוצה",
			url: "https://photos.app.goo.gl/abc",
			context: "בניית רובוט",
			tags: ["עבודת צוות"],
			enabled: true,
		},
	],
};
function repository(): SourcesRepository {
	return {
		load: async () => structuredClone(snapshot),
		history: async () => [],
		change: async () => ({ ...snapshot, revision: 1 }),
		uploadBackground: async () => snapshot.backgrounds[0]!.image,
		dispose() {},
	};
}
test("source store searches context and tags and observes saves; conflicts retain current data", async () => {
	const repo = repository();
	const store = new SourcesStore(repo);
	await store.load();
	store.setQuery("בניית צוות");
	assert.equal(store.visibleAlbums.length, 1);
	store.setQuery("לא קיים");
	assert.equal(store.visibleAlbums.length, 0);
	const revisions: (number | string)[] = [];
	const stop = autorun(() => {
		revisions.push(store.revision);
	});
	assert.equal(await store.change({ type: "delete", id: "team" }), true);
	assert.deepEqual(revisions, [0, 1]);
	repo.change = async () => {
		throw new Error("conflict");
	};
	assert.equal(await store.change({ type: "delete", id: "team" }), false);
	assert.equal(store.error, "conflict");
	assert.equal(store.albums.length, 1);
	stop();
	store.dispose();
});
test("source store ignores late loads and distinguishes history failure from successful mutations", async () => {
	const repo = repository();
	let finish!: (value: SourceSnapshot) => void;
	repo.load = () =>
		new Promise((resolve) => {
			finish = resolve;
		});
	const store = new SourcesStore(repo);
	const pending = store.load();
	store.dispose();
	finish(snapshot);
	await pending;
	assert.deepEqual(store.albums, []);
	repo.load = async () => structuredClone(snapshot);
	await store.load();
	repo.history = async () => {
		throw new Error("history offline");
	};
	assert.equal(await store.change({ type: "delete", id: "team" }), true);
	assert.equal(store.revision, 1);
	assert.equal(store.error, null);
	store.dispose();
});
test("source prompts carry the selected album and context into both creation workflows", () => {
	const album = snapshot.albums[0]!;
	for (const kind of ["deck", "video"] as const) {
		const prompt = sourcePrompt(album, kind);
		assert.ok(
			prompt.startsWith(
				kind === "deck" ? "$davinci-presentation" : "$davinci-interactive-video",
			),
		);
		assert.ok(prompt.includes(album.url));
		assert.ok(prompt.includes(album.context));
		assert.ok(prompt.includes(album.tags[0]!));
	}
});

test("background search and upload failures retain the current source revision", async () => {
	const repo = repository();
	const store = new SourcesStore(repo);
	await store.load();
	store.setQuery("ירחי רובוטיקה");
	assert.equal(store.visibleBackgrounds.length, 1);
	const uploaded = await store.uploadBackground(new ArrayBuffer(8), "image/png");
	assert.equal(uploaded?.sha256, snapshot.backgrounds[0]!.image.sha256);
	assert.equal(store.revision, 0);
	repo.uploadBackground = async () => {
		throw new Error("invalid image");
	};
	assert.equal(await store.uploadBackground(new ArrayBuffer(1), "image/png"), null);
	assert.equal(store.error, "invalid image");
	assert.equal(store.backgrounds.length, 1);
	store.dispose();
});
