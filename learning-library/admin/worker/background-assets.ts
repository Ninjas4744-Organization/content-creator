import { CatalogError } from "../server/catalog-domain.mjs";
import {
	backgroundFilePattern,
	inspectBackgroundImage,
	seedAsset,
	validateBackgroundAsset,
} from "../server/background-assets.mjs";
import type { BackgroundAsset } from "../src/models/sources";

const prefix = "private/admin-sources/background-assets/";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export class R2BackgroundAssets {
	constructor(
		private readonly bucket: R2Bucket,
		private readonly actor: string,
	) {}
	async metadata(file: string): Promise<BackgroundAsset | null> {
		if (!backgroundFilePattern.test(file)) throw new CatalogError("נתיב תמונה אינו תקין.");
		const seed = seedAsset(file);
		if (seed) return seed;
		const object = await this.bucket.head(prefix + file);
		if (!object?.customMetadata?.asset) return null;
		const asset = validateBackgroundAsset(JSON.parse(object.customMetadata.asset));
		if (asset.file !== file || asset.size !== object.size)
			throw new CatalogError("פרטי תמונת הרקע אינם תואמים.");
		return asset;
	}
	async upload(bytes: Uint8Array, contentType: string) {
		const asset = await inspectBackgroundImage(bytes, contentType);
		const written = await this.bucket.put(prefix + asset.file, bytes, {
			onlyIf: { etagDoesNotMatch: "*" },
			httpMetadata: { contentType: asset.contentType, cacheControl: "private, no-store" },
			customMetadata: { asset: JSON.stringify(asset), actor: this.actor },
		});
		if (!written && !(await this.metadata(asset.file)))
			throw new CatalogError("שמירת התמונה לא הושלמה.", 409);
		return asset;
	}
	async response(file: string, env: { ASSETS: Fetcher }, request: Request) {
		if (!backgroundFilePattern.test(file)) throw new CatalogError("תמונת הרקע לא נמצאה.", 404);
		const asset = await this.metadata(file);
		if (!asset) throw new CatalogError("תמונת הרקע לא נמצאה.", 404);
		let body: ReadableStream | null;
		if (seedAsset(file)) {
			const result = await env.ASSETS.fetch(
				new Request(new URL("/admin/source-backgrounds/" + file, request.url)),
			);
			if (!result.ok) throw new CatalogError("תמונת הרקע המקורית אינה זמינה.", 503);
			body = result.body;
		} else {
			const object = await this.bucket.get(prefix + file);
			if (!object) throw new CatalogError("תמונת הרקע לא נמצאה.", 404);
			body = object.body;
		}
		return new Response(request.method === "HEAD" ? null : body, {
			headers: {
				...headers,
				"Content-Type": asset.contentType,
				"Content-Length": String(asset.size),
			},
		});
	}
}
