import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SourcesStore } from "../server/sources.mjs";
import { BackgroundStorage } from "../server/background-storage.mjs";
import {
	inspectBackgroundImage,
	defaultBackgrounds,
	validateBackgroundAsset,
} from "../server/background-assets.mjs";
import { initialSourceState } from "../server/sources-domain.mjs";
import { backgroundPng, backgroundJpeg } from "./background-fixture.ts";

test("background images validate their format, dimensions, checksums and size", async () => {
	for (const [bytes, type] of [
		[backgroundPng, "image/png"],
		[backgroundJpeg, "image/jpeg"],
	]) {
		const asset = await inspectBackgroundImage(bytes, type);
		assert.deepEqual([asset.width, asset.height], [8, 5]);
		assert.equal(asset.file.slice(0, 64), asset.sha256);
		assert.equal(asset.size, bytes.length);
	}
	await assert.rejects(inspectBackgroundImage(backgroundPng, "image/jpeg"));
	await assert.rejects(
		inspectBackgroundImage(new TextEncoder().encode("<svg onload='alert(1)'/>"), "image/png"),
	);
	await assert.rejects(inspectBackgroundImage(backgroundPng.slice(0, -5), "image/png"));
	const corrupt = backgroundPng.slice();
	corrupt[45] ^= 1;
	await assert.rejects(inspectBackgroundImage(corrupt, "image/png"));
	await assert.rejects(inspectBackgroundImage(new Uint8Array(8 * 1024 * 1024 + 1), "image/png"));
	assert.throws(() =>
		validateBackgroundAsset({ ...defaultBackgrounds[0].image, file: "../outside.png" }),
	);
});

test("backgrounds migrate without changing albums, require an active choice, and retain recovery images", async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "davinci-backgrounds-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const file = join(directory, "sources.json");
	const previous = initialSourceState();
	delete previous.document.backgrounds;
	previous.document.future = { retained: true };
	previous.document.albums[0].context = "הקשר שנשמר קודם";
	await writeFile(file, JSON.stringify(previous));
	const assets = new BackgroundStorage(join(directory, "background-assets"));
	const store = new SourcesStore(file, assets);
	const migrated = await store.read();
	assert.deepEqual(migrated.document.backgrounds, defaultBackgrounds);
	assert.deepEqual(migrated.document.albums, previous.document.albums);
	const image = await assets.upload(backgroundPng, "image/png");
	assert.deepEqual(await assets.upload(backgroundPng, "image/png"), image);
	const background = {
		name: "עבודת צוות",
		description: "רקע להכשרת צוותים",
		image,
		enabled: true,
		future: "keep",
	};
	const created = await store.change("0", { type: "create-background", background });
	const id = created.document.backgrounds[1].id;
	await store.change("1", {
		type: "update-background",
		background: { ...created.document.backgrounds[0], enabled: false },
	});
	await assert.rejects(store.change("2", { type: "delete-background", id }), /רקע פעיל אחד/);
	await assert.rejects(
		store.change("2", {
			type: "update-background",
			background: { ...background, id, enabled: false },
		}),
		/רקע פעיל אחד/,
	);
	await assert.rejects(
		store.change("2", {
			type: "create-background",
			background: {
				...background,
				image: { ...image, file: "a".repeat(64) + ".png", sha256: "a".repeat(64) },
			},
		}),
		/חסרה/,
	);
	const updated = await store.change("2", {
		type: "update-background",
		background: { id, ...background, name: "הכשרה" },
	});
	const restored = await store.change("3", { type: "restore", id: updated.history.at(-1).id });
	assert.deepEqual(restored.document.albums, previous.document.albums);
	assert.deepEqual(restored.document.backgrounds, defaultBackgrounds);
	assert.deepEqual(restored.document.future, { retained: true });
	assert.deepEqual(new Uint8Array((await assets.read(image.file)).data), backgroundPng);
	assert.equal(
		(await readFile(join(directory, "background-assets", image.file))).length,
		image.size,
	);
});
