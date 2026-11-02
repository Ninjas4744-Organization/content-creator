import type {
	CatalogRepository,
	CatalogDocument,
	CatalogSnapshot,
	CatalogRevision,
	HistoryEntry,
} from "../models/catalog";

export function apiUrl(path: string): string {
	return `${(process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "")}${path}`;
}

export function createBrowserRepository(): CatalogRepository {
	const controllers = new Set<AbortController>();
	async function request<T>(
		path: string,
		method = "GET",
		body?: unknown,
		revision?: CatalogRevision,
	): Promise<T> {
		const controller = new AbortController();
		controllers.add(controller);
		try {
			const response = await fetch(apiUrl(path), {
				method,
				cache: "no-store",
				signal: controller.signal,
				headers:
					body === undefined
						? {}
						: { "Content-Type": "application/json", "If-Match": String(revision) },
				body: body === undefined ? undefined : JSON.stringify(body),
			});
			if (!response.headers.get("Content-Type")?.includes("application/json"))
				throw new Error("יש להתחבר מחדש לניהול הספרייה ולרענן את הדף.");
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "הפעולה לא הושלמה.");
			return data as T;
		} finally {
			controllers.delete(controller);
		}
	}
	return {
		load: () => request<CatalogSnapshot>("/api/catalog"),
		save: (items, revision, action) =>
			request<CatalogSnapshot>("/api/catalog", "PUT", { items, action }, revision),
		importCatalog: (catalog, mode, revision) =>
			request<CatalogSnapshot>("/api/import", "POST", { catalog, mode }, revision),
		changeGallery: (change, revision) =>
			request<CatalogSnapshot>("/api/galleries", "POST", change, revision),
		history: async () => (await request<{ history: HistoryEntry[] }>("/api/history")).history,
		restore: (id, revision) =>
			request<CatalogSnapshot>("/api/restore", "POST", { id }, revision),
		source: async () => (await request<{ catalog: CatalogDocument }>("/api/source")).catalog,
		dispose() {
			controllers.forEach((controller) => controller.abort());
			controllers.clear();
		},
	};
}
