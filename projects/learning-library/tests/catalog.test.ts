import assert from "node:assert/strict";
import { test } from "node:test";
import { CatalogStore } from "../src/features/catalog/CatalogStore";
import type { CatalogRepository, LearningItem } from "../src/models/catalog";

const items: LearningItem[] = [
	{
		id: "robot",
		title: "חשמל ברובוט FRC",
		description: "הסוללה שלנו",
		category: "רובוט",
		chapters: ["מנוע ובקר"],
		featured: false,
		poster: "poster.jpg",
		slides: 4,
		duration: null,
		checkpoints: 0,
		deck: "deck.html",
		powerpoint: null,
		video: null,
	},
	{
		id: "community",
		title: "קהילה",
		description: "משפיעים ביחד",
		category: "ערכים",
		chapters: ["עשייה"],
		featured: true,
		poster: "poster.jpg",
		slides: 5,
		duration: 90,
		checkpoints: 2,
		deck: "deck.html",
		powerpoint: null,
		video: "player.html",
	},
];
const repository = (list: CatalogRepository["list"] = async () => items): CatalogRepository => ({
	list,
	dispose() {},
});

test("search includes chapters, matches every word, and combines both filters", async () => {
	const store = new CatalogStore(repository());
	await store.load();
	store.setQuery("  frc מנוע  ");
	assert.deepEqual(
		store.visibleItems.map((item) => item.id),
		["robot"],
	);
	store.setFilter("video");
	assert.equal(store.visibleItems.length, 0);
	store.reset();
	store.setFilter("video");
	store.setCategory("ערכים");
	assert.deepEqual(
		store.visibleItems.map((item) => item.id),
		["community"],
	);
	assert.equal(store.featured?.id, "community");
});

test("disposal prevents a late response from changing the screen", async () => {
	let complete!: (items: LearningItem[]) => void;
	const store = new CatalogStore(
		repository(
			() =>
				new Promise((resolve) => {
					complete = resolve;
				}),
		),
	);
	const pending = store.load();
	store.dispose();
	complete(items);
	await pending;
	assert.equal(store.items.length, 0);
});

test("failed loading can be retried", async () => {
	let fail = true;
	const store = new CatalogStore(
		repository(async () => {
			if (fail) throw new Error("offline");
			return items;
		}),
	);
	await store.load();
	assert.ok(store.error);
	fail = false;
	await store.load();
	assert.equal(store.error, null);
	assert.equal(store.loading, false);
	assert.equal(store.items.length, 2);
});
