import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCatalog } from "../src/core/catalogDocument";
import { galleryHref, resolveGallery, viewerHref } from "../src/core/galleryRouting";
import { CatalogStore } from "../src/features/catalog/CatalogStore";
import { defaultGalleries, type LearningItem } from "../src/models/catalog";
const item: LearningItem = {
	id: "lesson",
	title: "שיעור",
	description: "",
	category: "הדרכות",
	chapters: [],
	featured: false,
	poster: "library/media/lesson/poster.jpg",
	slides: 1,
	duration: null,
	checkpoints: 0,
	deck: "library/media/lesson/presentation.html",
	powerpoint: null,
	video: null,
};
const custom = {
	id: "robotics",
	name: "רובוטיקה",
	url: "/training/robotics?lang=he",
	customMetadata: { retained: true },
};
const document = {
	schemaVersion: 1 as const,
	galleries: [...defaultGalleries, custom],
	items: [{ ...item, gallery: custom.id }],
	customMetadata: { retained: true },
};

test("new catalogs retain library definitions and metadata; legacy catalogs retain original galleries", () => {
	assert.deepEqual(parseCatalog(document), document);
	assert.deepEqual(parseCatalog([item]).galleries, defaultGalleries);
	assert.equal(parseCatalog([item]).items[0]?.id, item.id);
	for (const invalid of [
		{ ...document, schemaVersion: 2 },
		{ ...document, galleries: [] },
		{ ...document, items: [{ ...item, gallery: "missing" }] },
		{
			...document,
			galleries: [...defaultGalleries, { ...custom, url: "javascript:alert(1)" }],
		},
		{
			...document,
			galleries: [...defaultGalleries, { ...custom, url: "//evil.example" }],
		},
		{ ...document, galleries: [...defaultGalleries, custom, custom] },
	])
		assert.throws(() => parseCatalog(invalid));
});

test("custom library paths and names come from the catalog, including query parameters and nested paths", async () => {
	const address =
		"https://knowledge.davinci4744.com/training/robotics/?lang=he&item=lesson&view=deck";
	assert.equal(resolveGallery(document.galleries, address)?.id, custom.id);
	const store = new CatalogStore(
		{ list: async () => parseCatalog(document), dispose() {} },
		address,
	);
	await store.load();
	assert.equal(store.error, null);
	assert.equal(store.galleryDefinition?.name, "רובוטיקה");
	assert.equal(store.gallery, custom.id);
	assert.equal(store.visibleItems[0]?.id, item.id);
	const changed = {
		...document,
		galleries: document.galleries.map((gallery) =>
			gallery.id === custom.id
				? { ...gallery, name: "הדרכות", url: "/robotics-new" }
				: gallery,
		),
	};
	assert.equal(resolveGallery(changed.galleries, address), undefined);
	assert.equal(
		resolveGallery(changed.galleries, "https://knowledge.davinci4744.com/robotics-new")?.name,
		"הדרכות",
	);
	const missing = new CatalogStore(
		{
			list: async () => parseCatalog({ ...document, galleries: defaultGalleries, items: [] }),
			dispose() {},
		},
		address,
	);
	await missing.load();
	assert.match(missing.error!, /לא נמצאה/);
	assert.deepEqual(missing.visibleItems, []);
});

test("library links disambiguate shared paths and viewer navigation retains the gallery and other query parameters", () => {
	const gallery = { ...custom, url: "/" };
	const href = galleryHref(gallery, "https://knowledge.davinci4744.com/");
	assert.equal(resolveGallery([...defaultGalleries, gallery], href)?.id, gallery.id);
	const opened = new URL(viewerHref(href + "&lang=he#intro", "lesson", "video"), href);
	assert.equal(opened.searchParams.get("gallery"), gallery.id);
	assert.equal(opened.searchParams.get("lang"), "he");
	assert.equal(opened.searchParams.get("item"), "lesson");
	const closed = new URL(viewerHref(opened.href), opened);
	assert.equal(closed.searchParams.has("item"), false);
	assert.equal(closed.searchParams.has("view"), false);
	assert.equal(closed.searchParams.get("gallery"), gallery.id);
	assert.equal(closed.hash, "#intro");
	assert.equal(
		resolveGallery(defaultGalleries, "https://knowledge.davinci4744.com/?gallery=missing"),
		undefined,
	);
});
