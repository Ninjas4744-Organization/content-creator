import { CatalogError } from "../server/catalog-domain.mjs";
import {
	SourcesDomain,
	initialSourceState,
	sourceSnapshot,
	sourceHistory,
} from "../server/sources-domain.mjs";
import type { SourcesStorage, SourceState } from "../server/sources-domain.mjs";

const key = "private/admin-sources/photo-albums.json";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export class R2SourcesStorage implements SourcesStorage {
	constructor(
		private readonly bucket: R2Bucket,
		private readonly actor: string,
	) {}
	async read(): Promise<SourceState> {
		const object = await this.bucket.get(key);
		if (!object) return initialSourceState();
		return { ...(await object.json<SourceState>()), revision: object.etag };
	}
	async write(next: SourceState, before: SourceState): Promise<SourceState> {
		// The document and its 30 recovery snapshots are promoted together by one conditional write.
		const written = await this.bucket.put(key, JSON.stringify({ ...next, actor: this.actor }), {
			onlyIf:
				before.revision === 0
					? { etagDoesNotMatch: "*" }
					: { etagMatches: String(before.revision) },
			httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
		});
		if (!written)
			throw new CatalogError("המקורות השתנו מאז הטעינה. טענו מחדש לפני שמירה נוספת.", 409);
		return { ...next, revision: written.etag };
	}
}

/** The admin router authenticates requests and checks mutation origins before calling this handler. */
export async function sourcesApi(
	request: Request,
	env: { CONTENT: R2Bucket },
	actor: string,
): Promise<Response> {
	const path = new URL(request.url).pathname;
	const store = new SourcesDomain(new R2SourcesStorage(env.CONTENT, actor));
	const json = (value: unknown) => Response.json(value, { headers });
	if (request.method === "GET") {
		const state = await store.read();
		if (path === "/admin/api/creator/source-library")
			return json({
				...state.document,
				albums: state.document.albums.filter((album) => album.enabled),
				revision: state.revision,
				updatedAt: state.updatedAt,
			});
		if (path === "/admin/api/sources/history") return json({ history: sourceHistory(state) });
		if (path === "/admin/api/sources") return json(sourceSnapshot(state, "production"));
	}
	if (path === "/admin/api/sources" && request.method === "POST") {
		if (!request.headers.get("Content-Type")?.startsWith("application/json"))
			throw new CatalogError("נדרש JSON.", 415);
		const reader = request.body?.getReader();
		const chunks: Uint8Array[] = [];
		let size = 0;
		if (reader)
			while (true) {
				const part = await reader.read();
				if (part.done) break;
				size += part.value.length;
				if (size > 256 * 1024) {
					await reader.cancel();
					throw new CatalogError("הבקשה גדולה מדי.", 413);
				}
				chunks.push(part.value);
			}
		const bytes = new Uint8Array(size);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.length;
		}
		let input: unknown;
		try {
			input = JSON.parse(new TextDecoder().decode(bytes));
		} catch {
			throw new CatalogError("JSON אינו תקין.");
		}
		if (!input || typeof input !== "object" || Array.isArray(input))
			throw new CatalogError("נדרש אובייקט JSON.");
		return json(
			sourceSnapshot(
				await store.change(
					request.headers.get("If-Match") ?? undefined,
					input as Record<string, unknown>,
				),
				"production",
			),
		);
	}
	throw new CatalogError("הפעולה אינה נתמכת.", 405);
}
