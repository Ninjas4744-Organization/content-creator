import type { CatalogRepository, LearningItem } from "../models/catalog";

// Query-string routes stay at the export root, including on repository Pages sites.
export function publicUrl(path: string): string {
	if (typeof window === "undefined") return path;
	return new URL(path, window.location.href.split("?")[0]!.split("#")[0]).href;
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
