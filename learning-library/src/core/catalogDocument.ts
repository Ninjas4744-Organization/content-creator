import { defaultGalleries, itemGallery } from "../models/catalog";
import type { CatalogDocument, GalleryDefinition, LearningItem } from "../models/catalog";

export function parseCatalog(value: unknown): CatalogDocument {
	const legacy = Array.isArray(value);
	const raw = legacy ? { schemaVersion: 1, galleries: defaultGalleries, items: value } : value;
	if (
		!raw ||
		typeof raw !== "object" ||
		!("schemaVersion" in raw) ||
		raw.schemaVersion !== 1 ||
		!("galleries" in raw) ||
		!Array.isArray(raw.galleries) ||
		raw.galleries.length < 2 ||
		raw.galleries.length > 100 ||
		!("items" in raw) ||
		!Array.isArray(raw.items) ||
		raw.items.length > 1000
	)
		throw new Error("Invalid catalog document");
	const galleryIds = new Set<string>();
	const names = new Set<string>();
	for (const gallery of raw.galleries) {
		if (
			!gallery ||
			typeof gallery.id !== "string" ||
			!/^[A-Za-z0-9_-]{1,120}$/.test(gallery.id) ||
			galleryIds.has(gallery.id) ||
			["all", "featured", "history"].includes(gallery.id) ||
			typeof gallery.name !== "string" ||
			!gallery.name.trim() ||
			gallery.name !== gallery.name.trim() ||
			gallery.name.length > 100 ||
			names.has(gallery.name.toLocaleLowerCase("he")) ||
			typeof gallery.url !== "string" ||
			gallery.url.length > 2000 ||
			/[\u0000-\u0020\u007f\\]/.test(gallery.url) ||
			(!(gallery.url.startsWith("/") && !gallery.url.startsWith("//")) &&
				!/^https?:\/\//i.test(gallery.url))
		)
			throw new Error("Invalid catalog library");
		const url = new URL(gallery.url, "https://knowledge.davinci4744.com/");
		if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
			throw new Error("Invalid library URL");
		galleryIds.add(gallery.id);
		names.add(gallery.name.toLocaleLowerCase("he"));
	}
	for (const fixed of defaultGalleries.filter(
		(gallery) => gallery.id === "public" || gallery.id === "none",
	))
		if (
			!raw.galleries.some(
				(gallery) =>
					gallery.id === fixed.id &&
					gallery.name === fixed.name &&
					gallery.url === fixed.url,
			)
		)
			throw new Error("Invalid fixed library");
	const ids = new Set<string>();
	for (const item of raw.items) {
		if (
			!item ||
			typeof item.id !== "string" ||
			!/^[A-Za-z0-9_-]{1,120}$/.test(item.id) ||
			ids.has(item.id) ||
			typeof item.title !== "string" ||
			!Array.isArray(item.chapters) ||
			item.chapters.some((chapter: unknown) => typeof chapter !== "string") ||
			!galleryIds.has(itemGallery(item as LearningItem))
		)
			throw new Error("Invalid catalog item");
		ids.add(item.id);
	}
	return {
		...raw,
		schemaVersion: 1,
		galleries: raw.galleries as GalleryDefinition[],
		items: raw.items as LearningItem[],
	};
}
