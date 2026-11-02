import { parseCatalog } from "./catalogDocument";
import type { CatalogRepository } from "../models/catalog";

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
			const response = await fetch(
				process.env.EXPO_PUBLIC_CATALOG_URL || publicUrl("library/catalog.json"),
				{
					signal: controller.signal,
				},
			);
			if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
			return parseCatalog(await response.json());
		},
		dispose() {
			controller?.abort();
		},
	};
}
