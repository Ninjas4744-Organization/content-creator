import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { register } from "tsx/esm/api";
import { CatalogError } from "./catalog-domain.mjs";

const mediaOrigin = "https://knowledge.davinci4744.com/";
const mediaKey =
	/^library\/(?:releases\/[a-f0-9]{32}\/)?exports\/[a-z0-9-]+\/[A-Za-z0-9_./-]+\.zip$/;

let workerModules;
function worker() {
	if (!workerModules) {
		register();
		workerModules = Promise.all([
			import("../worker/blossom-courses.ts"),
			import("../worker/blossom.ts"),
		]);
	}
	return workerModules;
}

async function publishedAsset(key, method, options = {}) {
	if (!mediaKey.test(key) || key.split("/").some((part) => !part || part.startsWith(".")))
		return null;
	const headers = { "Accept-Encoding": "identity" };
	const etag = options.onlyIf?.etagMatches;
	if (etag) headers["If-Match"] = etag;
	const range = options.range;
	if (range)
		headers.Range = range.suffix
			? "bytes=-" + range.suffix
			: "bytes=" + range.offset + "-" + (range.offset + range.length - 1);
	const response = await fetch(new URL(key, mediaOrigin), {
		method,
		headers,
		redirect: "error",
		signal: AbortSignal.timeout(120_000),
	}).catch(() => {
		throw new CatalogError("לא ניתן לקרוא את חבילת ה־SCORM מספריית הידע.", 502);
	});
	const size = Number(response.headers.get("Content-Length"));
	const actualEtag = response.headers.get("ETag");
	const rangeSize = range?.suffix ?? range?.length;
	if (
		response.status !== (range ? 206 : 200) ||
		!actualEtag ||
		(etag && etag !== actualEtag) ||
		!Number.isSafeInteger(size) ||
		size < 1 ||
		(range && size !== rangeSize)
	) {
		await response.body?.cancel();
		return null;
	}
	return {
		size,
		etag: actualEtag,
		body: response.body,
		arrayBuffer: () => response.arrayBuffer(),
	};
}

// One local API process owns the receipt file. Conditional writes coordinate its requests.
function localBlossomObjects(file) {
	let pending = Promise.resolve();
	async function receipts() {
		try {
			return JSON.parse(await readFile(file, "utf8"));
		} catch (error) {
			if (error.code === "ENOENT") return {};
			throw error;
		}
	}
	return {
		head: (key) => publishedAsset(key, "HEAD"),
		async get(key, options) {
			if (key.startsWith("library/")) return publishedAsset(key, "GET", options);
			const entry = (await receipts())[key];
			return entry ? { etag: entry.etag, json: () => JSON.parse(entry.value) } : null;
		},
		put(key, value, { onlyIf, customMetadata }) {
			const operation = pending.then(async () => {
				const entries = await receipts();
				const previous = entries[key];
				if (onlyIf.etagMatches ? previous?.etag !== onlyIf.etagMatches : previous)
					return null;
				const etag = randomUUID();
				entries[key] = { etag, value, customMetadata };
				await mkdir(dirname(file), { recursive: true });
				const temp = file + "." + etag + ".tmp";
				try {
					await writeFile(temp, JSON.stringify(entries), { mode: 0o600, flag: "wx" });
					await rename(temp, file);
				} finally {
					await rm(temp, { force: true });
				}
				return { etag };
			});
			pending = operation.catch(() => {});
			return operation;
		},
		async list({ prefix }) {
			return {
				truncated: false,
				objects: Object.entries(await receipts())
					.filter(([key]) => key.startsWith(prefix))
					.map(([key, { customMetadata }]) => ({ key, customMetadata })),
			};
		},
	};
}

export function createLocalBlossom({ file, store, url, domain, userId, env }) {
	const base = new URL(url);
	if (
		base.protocol !== "http:" ||
		!["localhost", "127.0.0.1"].includes(base.hostname) ||
		base.username ||
		base.password ||
		base.search ||
		base.hash ||
		!/^[1-9]\d{0,9}$/.test(domain)
	)
		throw new Error(
			"BLOSSOM_LOCAL_URL and BLOSSOM_LOCAL_DOMAIN_ID must name a local Blossom domain.",
		);
	const CONTENT = localBlossomObjects(file);
	const settings = {
		CONTENT,
		BLOSSOM_COURSE_DOMAIN_ID: domain,
		BLOSSOM_CONTENT_API_USER: env.BLOSSOM_CONTENT_API_USER,
		BLOSSOM_CONTENT_API_PASSWORD: env.BLOSSOM_CONTENT_API_PASSWORD,
		BLOSSOM_SYNC_API_USER: env.BLOSSOM_SYNC_API_USER,
		BLOSSOM_SYNC_API_PASSWORD: env.BLOSSOM_SYNC_API_PASSWORD,
		BLOSSOM_REMOTE_API_USER: env.BLOSSOM_REMOTE_API_USER,
		BLOSSOM_REMOTE_API_PASSWORD: env.BLOSSOM_REMOTE_API_PASSWORD,
	};
	const transport = {
		baseUrl: base.href.replace(/\/$/, ""),
		sendMultipart(url, request, length) {
			const headers = new Headers(request.headers);
			headers.set("Content-Length", String(length));
			return fetch(url, { ...request, headers, duplex: "half" });
		},
	};
	return {
		async status() {
			const [{ listBlossomCourses }] = await worker();
			return {
				available: false,
				items: {},
				courses: await listBlossomCourses(CONTENT, store, domain, transport),
			};
		},
		async assignmentForms(id) {
			const [{ blossomAssignmentForms }] = await worker();
			return blossomAssignmentForms(CONTENT, store, domain, id, transport);
		},
		async publish(id, revision) {
			if (typeof userId !== "string" || !/^[1-9]\d{0,9}$/.test(userId))
				throw new CatalogError("יש להגדיר BLOSSOM_LOCAL_USER_ID בסביבת השרת המקומי.", 503);
			const [
				{ publishBlossomCourse },
				{ blossomApiUrl, blossomBasicAuth, readBlossomResponse },
			] = await worker();
			const authorization = blossomBasicAuth(
				settings.BLOSSOM_SYNC_API_USER,
				settings.BLOSSOM_SYNC_API_PASSWORD,
			);
			if (!authorization)
				throw new CatalogError("יש להגדיר את פרטי Sync API בסביבת השרת המקומי.", 503);
			const probe = await fetch(blossomApiUrl("sync_2/Test", transport), {
				headers: { Authorization: authorization },
				redirect: "error",
				signal: AbortSignal.timeout(10_000),
			}).catch(() => {
				throw new CatalogError("לא ניתן להתחבר ל־Blossom המקומי.", 502);
			});
			const result = await readBlossomResponse(probe);
			if (!probe.ok || result?.res !== "success")
				throw new CatalogError("פרטי ההתחברות ל־Sync API לא אומתו ב־Blossom המקומי.", 401);
			return publishBlossomCourse(settings, store, id, revision, userId, transport);
		},
	};
}
