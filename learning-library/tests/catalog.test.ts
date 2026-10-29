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

test("unlisted content opens by ID but never appears in gallery discovery", async () => {
	const hidden = {
		...items[1]!,
		id: "recruitment",
		title: "מצגת גיוסים",
		category: "היכרות עם התוכנית",
		unlisted: true,
	};
	const store = new CatalogStore(repository(async () => [hidden, ...items]));
	await store.load();
	assert.equal(store.items.find((item) => item.id === "recruitment")?.title, hidden.title);
	assert.deepEqual(
		store.visibleItems.map((item) => item.id),
		["robot", "community"],
	);
	assert.equal(store.featured?.id, "community");
	assert.equal(store.deckCount, 2);
	assert.equal(store.videoCount, 1);
	assert.ok(!store.categories.includes(hidden.category));
	store.setQuery("גיוסים");
	assert.deepEqual(store.visibleItems, []);

	const hiddenOnly = new CatalogStore(repository(async () => [hidden]));
	await hiddenOnly.load();
	assert.equal(hiddenOnly.featured, undefined);
	assert.equal(hiddenOnly.deckCount, 0);
	assert.equal(hiddenOnly.videoCount, 0);
	assert.deepEqual(hiddenOnly.categories, ["הכול"]);
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

test("team gallery searches and counts only unlisted content", async () => {
	const hidden = [
		{
			...items[0]!,
			id: "recruitment",
			title: "מצגת גיוסים",
			category: "היכרות עם התוכנית",
			unlisted: true,
		},
		{
			...items[1]!,
			id: "team-selection",
			title: "בחירת הצוותים",
			category: "היכרות עם התוכנית",
			unlisted: true,
		},
	];
	const store = new CatalogStore(
		repository(async () => [...items, ...hidden]),
		"team",
	);
	await store.load();
	assert.deepEqual(
		store.visibleItems.map((item) => item.id),
		["recruitment", "team-selection"],
	);
	assert.equal(store.featured?.id, "team-selection");
	assert.equal(store.deckCount, 2);
	assert.equal(store.videoCount, 1);
	assert.deepEqual(store.categories, ["הכול", "היכרות עם התוכנית"]);
	store.setQuery("קהילה");
	assert.equal(store.visibleItems.length, 0);
	store.setQuery("צוותים");
	store.setFilter("video");
	store.setCategory("היכרות עם התוכנית");
	assert.deepEqual(
		store.visibleItems.map((item) => item.id),
		["team-selection"],
	);
	store.reset();
	assert.equal(store.visibleItems.length, 2);
});

test("study content has its own discovery, filters and viewer without entering other galleries", async () => {
	const study: LearningItem[] = [
		{
			...items[1]!,
			id: "math-review",
			title: "חזרה למבחן במתמטיקה",
			description: "תרגול משוואות",
			chapters: ["משוואה ריבועית"],
			category: "מתמטיקה",
			gallery: "study",
		},
		{
			...items[0]!,
			id: "history-review",
			title: "חזרה בהיסטוריה",
			category: "היסטוריה",
			gallery: "study",
			unlisted: true,
		},
	];
	const team: LearningItem = { ...items[0]!, id: "recruitment", unlisted: true };
	const all = repository(async () => [...items, team, ...study]);
	const store = new CatalogStore(all, "study");
	await store.load();
	assert.deepEqual(
		store.visibleItems.map((item) => item.id),
		["math-review", "history-review"],
	);
	assert.equal(store.featured?.id, "math-review");
	assert.equal(store.deckCount, 2);
	assert.equal(store.videoCount, 1);
	assert.deepEqual(store.categories, ["הכול", "מתמטיקה", "היסטוריה"]);
	assert.deepEqual(store.viewableItems, store.listedItems);
	store.setQuery("מבחן ריבועית");
	store.setCategory("מתמטיקה");
	store.setFilter("video");
	assert.deepEqual(
		store.visibleItems.map((item) => item.id),
		["math-review"],
	);
	store.setCategory("היסטוריה");
	assert.equal(store.visibleItems.length, 0);
	store.reset();
	assert.equal(store.visibleItems.length, 2);

	for (const scope of ["public", "team"] as const) {
		const other = new CatalogStore(all, scope);
		await other.load();
		assert.ok(other.listedItems.every((item) => !study.includes(item)));
		assert.ok(other.viewableItems.every((item) => !study.includes(item)));
		assert.ok(!other.categories.includes("מתמטיקה"));
		assert.ok(!other.categories.includes("היסטוריה"));
		assert.equal(other.deckCount, scope === "public" ? 2 : 1);
		assert.equal(other.videoCount, scope === "public" ? 1 : 0);
		assert.equal(other.featured?.id, scope === "public" ? "community" : "recruitment");
		other.setQuery("מבחן");
		assert.equal(other.visibleItems.length, 0);
		if (scope === "public") {
			assert.ok(other.viewableItems.includes(team));
		}
	}
});

test("study gallery stays empty until school content is added", async () => {
	const store = new CatalogStore(repository(), "study");
	await store.load();
	assert.equal(store.loading, false);
	assert.equal(store.error, null);
	assert.deepEqual(store.visibleItems, []);
	assert.deepEqual(store.viewableItems, []);
	assert.deepEqual(store.categories, ["הכול"]);
	assert.equal(store.featured, undefined);
	assert.equal(store.deckCount, 0);
	assert.equal(store.videoCount, 0);
});
