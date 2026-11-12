import { CatalogError, type CatalogDomain } from "../server/catalog-domain.mjs";
import type { BlossomCatalog, LearningItem, MediaKind } from "../src/models/catalog";

export interface BlossomEnv {
	CONTENT: R2Bucket;
	BLOSSOM_CONTENT_API_USER?: string;
	BLOSSOM_CONTENT_API_PASSWORD?: string;
	BLOSSOM_COURSE_DOMAIN_ID?: string;
}

export interface BlossomTransport {
	baseUrl: string;
	sendMultipart(url: string, request: RequestInit, length: number): Promise<Response>;
}

interface Package {
	variant: MediaKind;
	path: string;
	size: number;
	etag: string;
}

interface Receipt {
	leaseUntil: number;
	uploaded?: { contentId: number };
}

type Outcome =
	| { status: "uploaded"; contentId: number }
	| { status: "retry" | "busy" | "superseded" | "invalid-package" }
	| { status: "rejected"; httpStatus: number };

export const blossomOrigin = "https://davinci4744.blossom-kc.com";
export const blossomApiUrl = (method: string, transport?: BlossomTransport) =>
	(transport?.baseUrl ?? blossomOrigin) + "/WebServices/" + method;
export const blossomContentEndpoint = (transport?: BlossomTransport) =>
	blossomApiUrl("content/Upload_ExtID", transport);
const encode = (value: string) => new TextEncoder().encode(value);
export const blossomItemId = /^[a-z0-9][a-z0-9-]{0,119}$/;
const blossomContentExternalId = (owner: string, id: string, variant: MediaKind) =>
	`davinci4744-user-${owner}-${id}-${variant}`;

export function blossomBasicAuth(user?: string, password?: string) {
	if (!user || user.includes(":") || !password) return null;
	return "Basic " + btoa(String.fromCharCode(...encode(`${user}:${password}`)));
}

export function blossomContentSettings(env: BlossomEnv, owner?: string) {
	const {
		BLOSSOM_COURSE_DOMAIN_ID: domain,
		BLOSSOM_CONTENT_API_USER: user,
		BLOSSOM_CONTENT_API_PASSWORD: password,
	} = env;
	const authorization = blossomBasicAuth(user, password);
	return owner && /^[1-9]\d{0,9}$/.test(owner) && domain && blossomId(domain) && authorization
		? { owner, domain, authorization }
		: null;
}

const receiptPrefix = (owner: string) => `private/blossom-content/${owner}/davinci4744-`;

export function blossomId(value: unknown): number | undefined {
	if (typeof value !== "string" && typeof value !== "number") return;
	const id = Number(value);
	if (/^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(id)) return id;
}

export async function readBlossomResponse(response: Response, maxBytes = 4096): Promise<unknown> {
	const reader = response.body?.getReader();
	if (!reader) return null;
	let result = "";
	const decoder = new TextDecoder();
	try {
		for (let part = await reader.read(); !part.done; part = await reader.read()) {
			if (result.length + part.value.length > maxBytes) return null;
			result += decoder.decode(part.value, { stream: true });
		}
		result += decoder.decode();
		return JSON.parse(result);
	} catch {
		return null;
	} finally {
		await reader.cancel();
	}
}

export function scormPath(item: LearningItem, variant: MediaKind) {
	const path = item.scorm?.[variant];
	const relative = path?.replace(/^library\/(?:releases\/[a-f0-9]{32}\/)?/, "");
	if (relative?.startsWith(`exports/${item.id}/`) && path?.endsWith(".zip")) return path;
}

// Inspect the ZIP directory without loading the video or decompressing user-supplied data.
async function hasScormManifest(bucket: R2Bucket, { path, size, etag }: Package) {
	const onlyIf = { etagMatches: etag };
	const tail = await bucket.get(path, { range: { suffix: Math.min(size, 65535 + 22) }, onlyIf });
	if (!tail || !("body" in tail)) return false;
	const end = new DataView(await tail.arrayBuffer());
	for (let i = end.byteLength - 22; i >= 0; i--) {
		if (end.getUint32(i, true) !== 0x06054b50) continue;
		if (i + 22 + end.getUint16(i + 20, true) !== end.byteLength) continue;
		const length = end.getUint32(i + 12, true);
		const offset = end.getUint32(i + 16, true);
		if (length < 46 || length > 1024 ** 2 || offset + length !== size - end.byteLength + i)
			return false;
		const directory = await bucket.get(path, { range: { offset, length }, onlyIf });
		if (!directory || !("body" in directory)) return false;
		const data = new DataView(await directory.arrayBuffer());
		const decoder = new TextDecoder();
		for (let entry = 0; entry + 46 <= data.byteLength;) {
			if (data.getUint32(entry, true) !== 0x02014b50) return false;
			const nameLength = data.getUint16(entry + 28, true);
			const nameOffset = entry + 46;
			if (nameOffset + nameLength > data.byteLength) return false;
			if (
				nameLength === 15 &&
				decoder.decode(new Uint8Array(data.buffer, nameOffset, nameLength)) ===
					"imsmanifest.xml"
			)
				return true;
			entry =
				nameOffset +
				nameLength +
				data.getUint16(entry + 30, true) +
				data.getUint16(entry + 32, true);
		}
		return false;
	}
	return false;
}

async function upload(
	file: R2ObjectBody,
	fields: Record<string, string>,
	authorization: string,
	deadline: AbortSignal,
	transport?: BlossomTransport,
): Promise<Outcome> {
	const boundary = crypto.randomUUID();
	const start = encode(
		Object.entries(fields)
			.map(
				([name, value]) =>
					`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
			)
			.join("") +
			`--${boundary}\r\nContent-Disposition: form-data; name="lessonfile"; filename="lesson.zip"\r\nContent-Type: application/zip\r\n\r\n`,
	);
	const end = encode(`\r\n--${boundary}--\r\n`);
	const length = start.length + file.size + end.length;
	const stream = transport ? undefined : new FixedLengthStream(length);
	const controller = new AbortController();
	const signal = AbortSignal.any([deadline, controller.signal]);
	async function* multipart() {
		yield start;
		yield* file.body;
		yield end;
	}
	const parts = multipart();
	const payload = new ReadableStream<Uint8Array>({
		async pull(target) {
			const part = await parts.next();
			if (part.done) target.close();
			else target.enqueue(part.value);
		},
		async cancel() {
			await parts.return();
		},
	});
	// Cancel both the R2 read and the outbound request if either side fails.
	const writing = stream
		? payload.pipeTo(stream.writable, { signal }).then(
				() => true,
				() => {
					controller.abort();
					return false;
				},
			)
		: Promise.resolve(true);
	try {
		const endpoint = blossomContentEndpoint(transport);
		const request: RequestInit = {
			method: "POST",
			headers: {
				Authorization: authorization,
				"Content-Type": `multipart/form-data; boundary=${boundary}`,
			},
			body: stream?.readable ?? payload,
			redirect: "manual",
			signal,
		};
		const response = transport
			? await transport.sendMultipart(endpoint, request, length)
			: await fetch(endpoint, request);
		if (!response.ok) {
			await response.body?.cancel();
			return { status: "rejected", httpStatus: response.status };
		}
		if (!(await writing)) return { status: "retry" };
		const result = await readBlossomResponse(response);
		const contentId =
			result && typeof result === "object" && "res" in result
				? result.res === "success" && "content_id" in result && blossomId(result.content_id)
				: blossomId(result);
		return contentId ? { status: "uploaded", contentId } : { status: "retry" };
	} finally {
		controller.abort();
		await writing;
	}
}

async function uploadPackage(
	bucket: R2Bucket,
	store: CatalogDomain,
	config: NonNullable<ReturnType<typeof blossomContentSettings>>,
	item: LearningItem,
	pkg: Package,
	revision: string,
	options?: { signal?: AbortSignal; transport?: BlossomTransport },
): Promise<Outcome> {
	const { owner, domain, authorization } = config;
	const externalId = blossomContentExternalId(owner, item.id, pkg.variant);
	const key = receiptPrefix(owner) + `${item.id}-${pkg.variant}.json`;
	const previous = await bucket.get(key);
	const receipt = previous ? await previous.json<Receipt>() : { leaseUntil: 0 };
	if (receipt.leaseUntil > Date.now()) return { status: "busy" };
	if (receipt.uploaded) return { status: "uploaded", contentId: receipt.uploaded.contentId };
	const locked = await bucket.put(key, JSON.stringify({ leaseUntil: Date.now() + 5 * 60_000 }), {
		onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: "*" },
	});
	if (!locked) return { status: "busy" };

	const snapshot = await store.read();
	const current = snapshot.items.find((candidate) => candidate.id === item.id);
	let result: Outcome;
	if (
		String(snapshot.revision) !== revision ||
		current?.poster !== item.poster ||
		current.scorm?.[pkg.variant] !== pkg.path
	) {
		result = { status: "superseded" };
	} else if (!(await hasScormManifest(bucket, pkg))) {
		result = { status: "invalid-package" };
	} else {
		const file = await bucket.get(pkg.path, {
			onlyIf: { etagMatches: pkg.etag },
		});
		if (!file || !("body" in file) || file.size !== pkg.size) return { status: "retry" };
		const label = pkg.variant === "deck" ? "מצגת" : "וידאו";
		const deadline = AbortSignal.timeout(90_000);
		result = await upload(
			file,
			{
				ext_id: externalId,
				user_id: owner,
				user: `user_id=${owner}&domain=${domain}`,
				metadata: new URLSearchParams({
					name: `${Array.from(current.title).slice(0, 185).join("")} · ${label}`,
					description: current.description,
					lang: "he",
					permissions: "none",
				}).toString(),
			},
			authorization,
			options?.signal ? AbortSignal.any([deadline, options.signal]) : deadline,
			options?.transport,
		);
	}
	// A lost response can mean the remote write is still running. Let that lease expire.
	if (result.status !== "retry") {
		const saved = result.status === "uploaded" ? { contentId: result.contentId } : undefined;
		await bucket.put(key, JSON.stringify({ leaseUntil: 0, uploaded: saved }), {
			onlyIf: { etagMatches: locked.etag },
			customMetadata: saved ? { contentId: String(saved.contentId) } : undefined,
		});
	}
	return result;
}

/** This private projection also reads receipts created before IDs were indexed in R2 metadata. */
export async function blossomCatalog(
	env: BlossomEnv,
	store: CatalogDomain,
	owner?: string,
): Promise<BlossomCatalog> {
	const config = blossomContentSettings(env, owner);
	const items: BlossomCatalog["items"] = Object.create(null);
	if (!config) return { available: false, items };
	const prefix = receiptPrefix(config.owner);
	const catalogIds = new Set((await store.read()).items.map(({ id }) => id));
	let cursor: string | undefined;
	do {
		const page = await env.CONTENT.list({ prefix, cursor, include: ["customMetadata"] });
		for (const object of page.objects) {
			const match = /^([a-z0-9][a-z0-9-]{0,119})-(deck|video)\.json$/.exec(
				object.key.slice(prefix.length),
			);
			if (!match || !catalogIds.has(match[1]!)) continue;
			const id = match[1]!;
			const variant = match[2] as MediaKind;
			let contentId = Number(object.customMetadata?.contentId);
			if (!contentId) {
				const record = await env.CONTENT.get(object.key);
				contentId = record ? Number((await record.json<Receipt>()).uploaded?.contentId) : 0;
			}
			if (Number.isSafeInteger(contentId) && contentId > 0)
				(items[id] ??= {})[variant] = contentId;
		}
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return { available: true, items };
}

export async function uploadExistingScorm(
	env: BlossomEnv,
	store: CatalogDomain,
	id: string,
	variant: MediaKind,
	revision: string | null,
	owner: string,
	options?: { signal?: AbortSignal; transport?: BlossomTransport },
) {
	const config = blossomContentSettings(env, owner);
	if (!config) throw new CatalogError("החיבור ל־Blossom אינו זמין.", 503);
	const catalog = await store.read();
	if (revision !== String(catalog.revision))
		throw new CatalogError("הקטלוג השתנה. רעננו אותו לפני ההעלאה.", 409);
	const item = catalog.items.find((candidate) => candidate.id === id);
	if (!item) throw new CatalogError("התוכן לא נמצא.", 404);
	const path = scormPath(item, variant);
	if (!path) throw new CatalogError("אין חבילת SCORM תקינה לתוכן הזה.", 422);
	const file = await env.CONTENT.head(path);
	if (!file || file.size < 1 || file.size > 1024 ** 3)
		throw new CatalogError("חבילת ה־SCORM חסרה או חורגת ממגבלת הגודל.", 422);
	const result = await uploadPackage(
		env.CONTENT,
		store,
		config,
		item,
		{ path, variant, size: file.size, etag: file.etag },
		revision,
		options,
	).catch(() => ({ status: "retry" as const }));
	switch (result.status) {
		case "uploaded":
			return result.contentId;
		case "invalid-package":
			throw new CatalogError("הקובץ אינו חבילת SCORM תקינה.", 422);
		case "superseded":
			throw new CatalogError("חבילת התוכן השתנתה. רעננו ונסו שוב.", 409);
		case "busy":
			throw new CatalogError("העלאה קודמת עדיין בטיפול. נסו שוב בעוד כמה דקות.", 409);
		case "rejected":
			throw new CatalogError(`Blossom דחה את ההעלאה (HTTP ${result.httpStatus}).`, 502);
		default:
			throw new CatalogError("לא התקבל אישור העלאה מ־Blossom. אפשר לנסות שוב.", 502);
	}
}
