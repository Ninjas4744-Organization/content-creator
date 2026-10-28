import type { CatalogRepository, LearningItem } from "../models/catalog";

// The HTML base keeps catalog and media URLs at the export root on every route.
export function publicUrl(path: string): string {
	if (typeof window === "undefined") return path;
	return new URL(
		path,
		typeof document === "undefined"
			? new URL("/", window.location.href).href
			: document.baseURI,
	).href;
}

export function createBrowserRepository(): CatalogRepository {
	let controller: AbortController | undefined;
	return {
		async list() {
			controller?.abort();
			controller = new AbortController();
			const response = await fetch(publicUrl("library/catalog.json"), {
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
			const data: unknown = await response.json();
			if (
				!Array.isArray(data) ||
				data.some(
					(item) =>
						!item ||
						typeof item.id !== "string" ||
						typeof item.title !== "string" ||
						!Array.isArray(item.chapters),
				)
			) {
				throw new Error("Invalid catalog");
			}
			return data as LearningItem[];
		},
		dispose() {
			controller?.abort();
		},
	};
}
