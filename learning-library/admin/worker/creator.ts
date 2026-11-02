import {
	CatalogDomain,
	CatalogError,
	documentOf,
	validateDocument,
} from "../server/catalog-domain.mjs";
import type { CatalogStorage } from "../server/catalog-domain.mjs";

const chunkSize = 8 * 1024 * 1024;
const prefix = "library/creator-uploads/";
const types: Record<string, string> = {
	html: "text/html; charset=utf-8",
	css: "text/css; charset=utf-8",
	js: "text/javascript; charset=utf-8",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	svg: "image/svg+xml",
	ttf: "font/ttf",
	woff: "font/woff",
	woff2: "font/woff2",
	vtt: "text/vtt; charset=utf-8",
	mp4: "video/mp4",
	txt: "text/plain; charset=utf-8",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	zip: "application/zip",
};
interface UploadFile {
	path: string;
	size: number;
	hashes: string[];
}
interface Session {
	id: string;
	actor: string;
	expires: number;
	revision: string | number;
	items: ReturnType<typeof validateDocument>["items"];
	files: UploadFile[];
}
interface CreatorEnv {
	CONTENT: R2Bucket;
	ASSETS: Fetcher;
}
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
function fail(message: string, status = 400): never {
	throw new CatalogError(message, status);
}
async function bytes(request: Request, limit: number): Promise<Uint8Array> {
	const reader = request.body?.getReader();
	if (!reader) return new Uint8Array();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const part = await reader.read();
		if (part.done) break;
		size += part.value.length;
		if (size > limit) {
			await reader.cancel();
			fail("הקובץ גדול מדי.", 413);
		}
		chunks.push(part.value);
	}
	const result = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}
async function body(request: Request): Promise<Record<string, unknown>> {
	if (!request.headers.get("Content-Type")?.startsWith("application/json"))
		fail("נדרש JSON.", 415);
	try {
		const value: unknown = JSON.parse(
			new TextDecoder().decode(await bytes(request, 4 * 1024 * 1024)),
		);
		if (!value || typeof value !== "object" || Array.isArray(value)) fail("נדרש אובייקט JSON.");
		return value as Record<string, unknown>;
	} catch (error) {
		if (error instanceof CatalogError) throw error;
		return fail("JSON אינו תקין.");
	}
}
const digest = async (data: Uint8Array) =>
	Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
		.map((n) => n.toString(16).padStart(2, "0"))
		.join("");
function key(session: Session, file: UploadFile) {
	return file.path.startsWith("sources/")
		? `library/creator-sources/${session.id}/${file.path.slice(8)}`
		: `library/releases/${session.id}/${file.path}`;
}
function references(item: Session["items"][number]) {
	return [
		item.poster,
		item.deck,
		item.video,
		item.powerpoint,
		...Object.values(item.scorm ?? {}),
	].filter((v): v is string => typeof v === "string" && v !== "");
}
function manifest(
	input: Record<string, unknown>,
	current: Awaited<ReturnType<CatalogDomain["read"]>>,
	actor: string,
): Session {
	const incoming = validateDocument(input.catalog);
	if (!incoming.items.length || incoming.items.length > 20)
		fail("אפשר לפרסם 1–20 תכנים בכל העלאה.");
	const ids = new Set(incoming.items.map((item) => item.id));
	if ([...ids].some((id) => !/^[a-z0-9][a-z0-9-]{0,119}$/.test(id))) fail("מזהה תוכן אינו תקין.");
	// Library definitions and catalog metadata are managed by the admin, never by a package.
	validateDocument({ ...documentOf(current), items: incoming.items });
	if (!Array.isArray(input.files) || !input.files.length || input.files.length > 200)
		fail("חבילת קבצים אינה תקינה (עד 200 קבצים).");
	const paths = new Set<string>();
	let total = 0;
	const files: UploadFile[] = input.files.map((value: unknown) => {
		if (!value || typeof value !== "object") return fail("רשומת קובץ אינה תקינה.");
		const file = value as UploadFile;
		if (typeof file.path !== "string") fail("נתיב קובץ אינו תקין.");
		const parts = typeof file.path === "string" ? file.path.split("/") : [];
		const sourceId = /^sources\/([a-z0-9-]+)\.zip$/.exec(file.path)?.[1];
		if (
			!file.path ||
			file.path.length > 500 ||
			!/^[A-Za-z0-9_./-]+$/.test(file.path) ||
			parts.some((p) => !p || p.startsWith(".")) ||
			paths.has(file.path.toLowerCase()) ||
			!(sourceId
				? ids.has(sourceId)
				: ["media", "exports"].includes(parts[0] ?? "") && ids.has(parts[1] ?? "")) ||
			!types[file.path.split(".").at(-1)!]
		)
			fail("נתיב קובץ אינו מורשה.");
		if (
			!Number.isSafeInteger(file.size) ||
			file.size < 1 ||
			file.size > 1024 ** 3 ||
			!Array.isArray(file.hashes) ||
			file.hashes.length !== Math.ceil(file.size / chunkSize) ||
			file.hashes.some((h) => typeof h !== "string" || !/^[a-f0-9]{64}$/.test(h))
		)
			fail("גודל קובץ או חתימות אינם תקינים.");
		paths.add(file.path.toLowerCase());
		total += file.size;
		return { path: file.path, size: file.size, hashes: file.hashes };
	});
	if (total > 2 * 1024 ** 3) fail("חבילת הפרסום גדולה מדי.", 413);
	for (const item of incoming.items) {
		if (!paths.has(`sources/${item.id}.zip`)) fail("חסרים מקורות לעריכה חוזרת.");
		for (const path of references(item)) {
			if (
				!path.startsWith(`library/media/${item.id}/`) &&
				!path.startsWith(`library/exports/${item.id}/`)
			)
				fail("המדיה חייבת להשתייך לתוכן המפורסם.");
			if (!files.some((file) => "library/" + file.path === path))
				fail("קובץ מדיה חסר בחבילה.");
		}
	}
	return {
		id: crypto.randomUUID().replaceAll("-", ""),
		actor,
		expires: Date.now() + 24 * 60 * 60 * 1000,
		revision: current.revision,
		items: incoming.items,
		files,
	};
}
async function sessionOf(bucket: R2Bucket, id: string, actor: string) {
	if (!/^[a-f0-9]{32}$/.test(id)) fail("מזהה העלאה אינו תקין.");
	const object = await bucket.get(prefix + id + "/session.json");
	if (!object) fail("ההעלאה לא נמצאה.", 404);
	const session = await object.json<Session>();
	if (session.actor !== actor) fail("ההעלאה שייכת ליוצר אחר.", 403);
	if (session.expires < Date.now()) fail("ההעלאה פגה. התחילו העלאה חדשה.", 410);
	return session;
}

/** Called only after Access authentication, allowlist and same-origin mutation checks. */
export async function creatorApi(
	request: Request,
	env: CreatorEnv,
	actor: string,
	storage: CatalogStorage,
): Promise<Response> {
	const path = new URL(request.url).pathname.slice("/admin/api/creator/".length);
	const bucket = env.CONTENT;
	if (["kit", "kit-manifest"].includes(path) && request.method === "GET") {
		const asset = new URL(
			path === "kit" ? "/admin/creator-kit.zip" : "/admin/creator-kit.json",
			request.url,
		);
		const result = await env.ASSETS.fetch(new Request(asset));
		if (
			!result.ok ||
			(path === "kit"
				? !result.headers.get("Content-Type")?.includes("zip")
				: !result.headers.get("Content-Type")?.includes("json"))
		)
			fail("ערכת היצירה עדיין לא נבנתה.", 503);
		const response = new Response(result.body, result);
		for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
		if (path === "kit")
			response.headers.set(
				"Content-Disposition",
				'attachment; filename="davinci-creator.zip"',
			);
		return response;
	}
	const store = new CatalogDomain(storage);
	if (path.startsWith("sources/") && request.method === "GET") {
		const id = path.slice(8);
		if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(id)) fail("מזהה תוכן אינו תקין.");
		const current = await store.read();
		const item = current.items.find((item) => item.id === id);
		const release = item?.poster.match(/^library\/releases\/([a-f0-9]{32})\//)?.[1];
		let object = release
			? await bucket.get(`library/creator-sources/${release}/${id}.zip`)
			: null;
		if (!object && item) {
			const legacy = await bucket.get("project-sources/catalog.json");
			const index = legacy
				? await legacy.json<{
						projects?: Record<string, { key?: string; sha256?: string }>;
					}>()
				: null;
			const entry = index?.projects?.[id];
			if (
				entry?.sha256 &&
				/^[a-f0-9]{64}$/.test(entry.sha256) &&
				entry.key === `project-sources/${id}/${entry.sha256}.zip`
			)
				object = await bucket.get(entry.key);
		}
		if (!object) fail("אין מקורות זמינים לפריט הזה בערכת היוצרים.", 404);
		return new Response(object.body, {
			headers: {
				...headers,
				"Content-Type": "application/zip",
				"Content-Disposition": `attachment; filename="${id}.zip"`,
			},
		});
	}
	if (path === "uploads" && request.method === "POST") {
		const current = await store.read();
		if (request.headers.get("If-Match") !== String(current.revision))
			fail("הקטלוג השתנה. טענו אותו ושלבו את השינויים לפני הפרסום.", 409);
		const session = manifest(await body(request), current, actor);
		await bucket.put(prefix + session.id + "/session.json", JSON.stringify(session), {
			httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
		});
		return json({ id: session.id, chunkSize, expires: session.expires }, 201);
	}
	const match =
		/^uploads\/([a-f0-9]{32})(?:\/files\/(\d+)(?:\/parts\/(\d+)|\/(complete))?|\/(publish))?$/.exec(
			path,
		);
	if (!match) return fail("הפעולה לא נמצאה.", 404);
	const session = await sessionOf(bucket, match[1]!, actor);
	if (match[5] === "publish" && request.method === "POST") {
		const current = await store.read();
		const rewrite = (value: string | null | undefined) =>
			value ? value.replace(/^library\//, `library/releases/${session.id}/`) : value;
		const updates = session.items.map((item) => ({
			...item,
			...current.items.find((old) => old.id === item.id),
			poster: rewrite(item.poster)!,
			deck: rewrite(item.deck),
			video: rewrite(item.video),
			powerpoint: rewrite(item.powerpoint),
			scorm: Object.fromEntries(
				Object.entries(item.scorm ?? {}).map(([k, v]) => [k, rewrite(v)]),
			),
		}));
		if (
			updates.every(
				(item) => current.items.find((old) => old.id === item.id)?.poster === item.poster,
			)
		)
			return json({
				revision: current.revision,
				ids: updates.map((item) => item.id),
				published: true,
			});
		if (String(current.revision) !== String(session.revision))
			fail("הקטלוג השתנה בזמן ההעלאה. טענו ושלבו מחדש לפני הפרסום.", 409);
		for (const file of session.files) {
			const object = await bucket.head(key(session, file));
			if (
				!object ||
				object.size !== file.size ||
				object.customMetadata?.creatorSession !== session.id
			)
				fail("העלאת הקבצים טרם הושלמה.", 409);
		}
		const byId = new Map(updates.map((item) => [item.id, item]));
		const items = current.items.map((item) => byId.get(item.id) ?? item);
		items.push(...updates.filter((item) => !current.items.some((old) => old.id === item.id)));
		const saved = await store.mutate(
			String(session.revision),
			items,
			`פרסום ${updates.length} תכנים על ידי סוכן`,
		);
		return json({
			revision: saved.revision,
			ids: updates.map((item) => item.id),
			published: true,
		});
	}
	const index = Number(match[2]);
	const file = session.files[index];
	if (match[2] === undefined || !file) return fail("הקובץ לא נמצא.", 404);
	const objectKey = key(session, file);
	const stateKey = prefix + session.id + `/files/${index}.json`;
	const done = await bucket.head(objectKey);
	if (done) return json({ complete: true }); // Published release objects are immutable.
	const state = await bucket.get(stateKey);
	if (!match[3] && !match[4] && request.method === "POST") {
		if (!state) {
			const upload = await bucket.createMultipartUpload(objectKey, {
				httpMetadata: {
					contentType: types[file.path.split(".").at(-1)!],
					cacheControl: file.path.startsWith("sources/")
						? "no-store"
						: "public, max-age=31536000, immutable",
				},
				customMetadata: { creatorSession: session.id },
			});
			const created = await bucket.put(
				stateKey,
				JSON.stringify({ uploadId: upload.uploadId }),
				{ onlyIf: { etagDoesNotMatch: "*" } },
			);
			if (!created) await upload.abort();
		}
		return json({ complete: false });
	}
	if (!state) return fail("יש להתחיל את העלאת הקובץ.", 409);
	const { uploadId } = await state.json<{ uploadId: string }>();
	const upload = bucket.resumeMultipartUpload(objectKey, uploadId);
	if (match[3] && request.method === "PUT") {
		const number = Number(match[3]);
		if (!Number.isSafeInteger(number) || number < 1 || number > file.hashes.length)
			fail("מספר מקטע אינו תקין.");
		const size = Math.min(chunkSize, file.size - (number - 1) * chunkSize);
		const data = await bytes(request, size);
		if (data.length !== size || (await digest(data)) !== file.hashes[number - 1])
			fail("אימות הקובץ נכשל.");
		return json(await upload.uploadPart(number, data));
	}
	if (match[4] && request.method === "POST") {
		const { parts } = await body(request);
		if (
			!Array.isArray(parts) ||
			parts.length !== file.hashes.length ||
			parts.some(
				(p: R2UploadedPart, i: number) =>
					!p ||
					p.partNumber !== i + 1 ||
					typeof p.etag !== "string" ||
					p.etag.length > 200,
			)
		)
			fail("רשימת מקטעים אינה תקינה.");
		await upload.complete(parts as R2UploadedPart[]);
		return json({ complete: true });
	}
	return fail("הפעולה אינה נתמכת.", 405);
}
