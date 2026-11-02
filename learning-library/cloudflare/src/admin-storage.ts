import {
	CatalogError,
	documentOf,
	stateFromDocument,
	validateDocument,
	type CatalogState,
	type CatalogStorage,
	type StoredHistory,
} from "../../admin/server/catalog-domain.mjs";
const catalogKey = "library/catalog.json";
const historyPrefix = "library/admin-history/";
const maximumTime = 9_999_999_999_999;
function assetPaths(document: ReturnType<typeof documentOf>) {
	return new Set(
		document.items
			.flatMap((item) => [
				item.poster,
				item.deck,
				item.video,
				item.powerpoint,
				...Object.values(item.scorm ?? {}),
			])
			.filter((value): value is string => typeof value === "string" && value !== ""),
	);
}
export class R2CatalogStorage implements CatalogStorage {
	constructor(
		private readonly bucket: R2Bucket,
		private readonly actor: string,
	) {}
	async read(): Promise<CatalogState> {
		const object = await this.bucket.get(catalogKey);
		if (!object) throw new CatalogError("הקטלוג שפורסם לא נמצא. לא בוצעו שינויים.", 503);
		if (object.size > 4 * 1024 * 1024) throw new CatalogError("הקטלוג גדול מדי לעריכה.", 503);
		return stateFromDocument(await object.json(), object.etag, object.uploaded.toISOString());
	}
	private async validateAssets(next: CatalogState, before: CatalogState) {
		const existing = assetPaths(documentOf(before));
		const paths = [...assetPaths(documentOf(next))].filter((path) => !existing.has(path));
		for (let offset = 0; offset < paths.length; offset += 8) {
			const present = await Promise.all(
				paths.slice(offset, offset + 8).map(async (path) => {
					if (
						!/^library\/(?:releases\/[a-f0-9]{32}\/)?(?:media|exports)\/[A-Za-z0-9_./-]+\.(?:html|css|js|jpg|jpeg|png|webp|svg|ttf|woff2?|vtt|mp4|txt|pptx|zip)$/.test(
							path,
						)
					)
						return false;
					return Boolean(await this.bucket.head(path));
				}),
			);
			if (present.some((value) => !value))
				throw new CatalogError(
					"אחד מקישורי המדיה החדשים אינו קיים בספרייה. יש להעלות את הקבצים לפני השמירה.",
				);
		}
	}
	async write(next: CatalogState, before: CatalogState): Promise<CatalogState> {
		const document = validateDocument(documentOf(next));
		await this.validateAssets(next, before);
		const entry = next.history[0]!;
		const id = `${String(maximumTime - Date.now()).padStart(13, "0")}-${entry.id}`;
		const historyKey = historyPrefix + id + ".json";
		const { items, galleries, catalogMetadata, ...metadata } = entry;
		const snapshot = { ...metadata, id, catalog: documentOf(before), actor: this.actor };
		await this.bucket.put(historyKey, JSON.stringify(snapshot), {
			httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
			customMetadata: {
				id,
				at: entry.at,
				action: entry.action,
				revision: String(before.revision),
				count: String(before.items.length),
				actor: this.actor,
			},
		});
		const written = await this.bucket.put(
			catalogKey,
			JSON.stringify(document, null, 2) + "\n",
			{
				onlyIf: { etagMatches: String(before.revision) },
				httpMetadata: {
					contentType: "application/json; charset=utf-8",
					cacheControl: "no-cache",
				},
			},
		);
		if (!written) {
			await this.bucket.delete(historyKey);
			throw new CatalogError(
				"הקטלוג השתנה מאז הטעינה. רעננו את הנתונים לפני שמירה נוספת.",
				409,
			);
		}
		return {
			...next,
			revision: written.etag,
			updatedAt: written.uploaded.toISOString(),
			mode: "production",
			history: [],
		};
	}
	async history(): Promise<StoredHistory[]> {
		const objects = await this.bucket.list({
			prefix: historyPrefix,
			limit: 30,
			include: ["customMetadata"],
		});
		return objects.objects.map((object) => {
			const data = object.customMetadata ?? {};
			return {
				id: data.id ?? object.key.slice(historyPrefix.length, -5),
				at: data.at ?? object.uploaded.toISOString(),
				action: data.action ?? "עדכון קטלוג",
				revision: data.revision ?? "",
				count: Number(data.count ?? 0),
				actor: data.actor ?? "",
			};
		});
	}
	async snapshot(id: string): Promise<StoredHistory | null> {
		if (!/^\d{13}-[a-f0-9-]{36}$/.test(id)) throw new CatalogError("מזהה גרסה אינו תקין.");
		const object = await this.bucket.get(historyPrefix + id + ".json");
		if (!object) return null;
		const data = await object.json<{
			id: string;
			at: string;
			action: string;
			revision: string;
			catalog: unknown;
		}>();
		const state = stateFromDocument(data.catalog);
		return {
			id,
			at: data.at,
			action: data.action,
			revision: data.revision,
			items: state.items,
			galleries: state.galleries,
			catalogMetadata: state.catalogMetadata,
		};
	}
}
