import type { GalleryDefinition } from "../models/catalog";
const pathOf = (url: URL) => decodeURI(url.pathname).replace(/\/+$/, "") || "/";
export function resolveGallery(
	galleries: readonly GalleryDefinition[],
	address: string,
): GalleryDefinition | undefined {
	const location = new URL(address, "https://knowledge.davinci4744.com/");
	const requested = location.searchParams.get("gallery");
	return galleries.find((gallery) => {
		if (gallery.id === "none" || (requested && requested !== gallery.id)) return false;
		const target = new URL(gallery.url, location.origin);
		return (
			target.origin === location.origin &&
			pathOf(target) === pathOf(location) &&
			(requested ||
				[...target.searchParams].every(
					([key, value]) => location.searchParams.get(key) === value,
				))
		);
	});
}
export function galleryHref(gallery: GalleryDefinition, base: string): string {
	const url = new URL(gallery.url, base);
	if (gallery.id !== "public" && gallery.id !== "none")
		url.searchParams.set("gallery", gallery.id);
	return url.href;
}
export function viewerHref(address: string, id?: string, kind?: string): string {
	const url = new URL(address);
	url.searchParams.delete("item");
	url.searchParams.delete("view");
	if (id && kind) {
		url.searchParams.set("item", id);
		url.searchParams.set("view", kind);
	}
	return url.pathname + url.search + url.hash;
}
