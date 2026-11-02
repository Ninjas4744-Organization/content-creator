import type { GalleryDefinition, LearningItem } from "../models/catalog";
import { itemGallery } from "../models/catalog";

const origin = "https://knowledge.davinci4744.com/";
export function assetUrl(path: string): string {
	return /^library\/[A-Za-z0-9_./-]+$/.test(path) ? new URL(path, origin).href : "";
}
export function galleryUrl(
	gallery?: Pick<GalleryDefinition, "url"> & Partial<Pick<GalleryDefinition, "id">>,
): string {
	try {
		const url = new URL(gallery?.url ?? "/", origin);
		if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) {
			if (gallery && "id" in gallery && gallery.id !== "public" && gallery.id !== "none")
				url.searchParams.set("gallery", String(gallery.id));
			return url.href;
		}
	} catch {
		// A malformed local setting must not become an executable link.
	}
	return origin;
}
export function itemUrl(item: LearningItem, galleries: readonly GalleryDefinition[]): string {
	const gallery = galleries.find((entry) => entry.id === itemGallery(item));
	const url = new URL(galleryUrl(gallery));
	url.searchParams.set("item", item.id);
	url.searchParams.set("view", item.deck ? "deck" : "video");
	return url.href;
}
