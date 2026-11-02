import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { CatalogStore, CatalogError, validateDocument, documentOf } from "./catalog.mjs";
import { SourcesStore } from "./sources.mjs";
import { sourceSnapshot, sourceHistory } from "./sources-domain.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = "https://knowledge.davinci4744.com/library/catalog.json";
const MAX_BODY = 4 * 1024 * 1024;
const types = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".ico": "image/x-icon",
	".svg": "image/svg+xml",
	".json": "application/json",
	".ttf": "font/ttf",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".txt": "text/plain; charset=utf-8",
	".zip": "application/zip",
};
const headers = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "no-referrer",
	"X-Frame-Options": "DENY",
	"Cache-Control": "no-store",
	"Content-Security-Policy":
		"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://knowledge.davinci4744.com data:; font-src 'self'; connect-src 'self'; frame-src https://knowledge.davinci4744.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

async function body(request) {
	if (!request.headers["content-type"]?.startsWith("application/json"))
		throw new CatalogError("נדרש JSON.", 415);
	let size = 0;
	const chunks = [];
	for await (const chunk of request) {
		size += chunk.length;
		if (size > MAX_BODY) throw new CatalogError("הקובץ גדול מדי (עד 4MB).", 413);
		chunks.push(chunk);
	}
	let parsed;
	try {
		parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new CatalogError("קובץ JSON אינו תקין.");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		throw new CatalogError("נדרש אובייקט JSON תקין.");
	return parsed;
}

export function createApp({
	dataFile = resolve(root, "data/workspace.json"),
	seedFile = resolve(root, "fixtures/catalog.json"),
	staticDirectory = resolve(root, "output/site"),
	creatorKitDirectory = resolve(root, "output/creator-kit"),
	devOrigin = process.env.ADMIN_DEV_ORIGIN || null,
	libraryOrigin = process.env.LIBRARY_DEV_ORIGIN || null,
	fetchCatalog = async () => {
		const response = await fetch(source, {
			signal: AbortSignal.timeout(15000),
			redirect: "error",
		});
		if (!response.ok) throw new CatalogError("לא ניתן לקרוא את הקטלוג הציבורי כרגע.", 502);
		const raw = await response.text();
		if (Buffer.byteLength(raw) > MAX_BODY)
			throw new CatalogError("הקטלוג הציבורי גדול מדי.", 502);
		return validateDocument(JSON.parse(raw));
	},
} = {}) {
	const publicDir = resolve(staticDirectory);
	if (libraryOrigin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(libraryOrigin))
		throw new Error("LIBRARY_DEV_ORIGIN must be an explicit loopback origin.");
	if (devOrigin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(devOrigin))
		throw new Error("ADMIN_DEV_ORIGIN must be an explicit loopback origin.");
	const developmentOrigins = new Set(
		devOrigin ? [devOrigin, devOrigin.replace("localhost", "127.0.0.1")] : [],
	);
	const libraryOrigins = new Set(
		libraryOrigin ? [libraryOrigin, libraryOrigin.replace("localhost", "127.0.0.1")] : [],
	);
	const store = new CatalogStore(dataFile, seedFile);
	const sources = new SourcesStore(resolve(dirname(dataFile), "sources.json"));
	const json = (response, status, value, extra = {}) => {
		response.writeHead(status, {
			...headers,
			"Content-Type": "application/json; charset=utf-8",
			...extra,
		});
		response.end(JSON.stringify(value));
	};
	const payload = (state) => ({
		...documentOf(state),
		mode: "local",
		revision: state.revision,
		updatedAt: state.updatedAt,
	});
	return createServer(async (request, response) => {
		try {
			// This initial, unauthenticated workspace is deliberately loopback-only.
			const host = request.headers.host;
			if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host))
				throw new CatalogError("גישה מקומית בלבד.", 403);
			const origin = `http://${host}`;
			const url = new URL(request.url, origin);
			const developmentRequest = developmentOrigins.has(request.headers.origin);
			const libraryRead =
				url.pathname === "/library/catalog.json" &&
				["GET", "HEAD"].includes(request.method) &&
				libraryOrigins.has(request.headers.origin);
			if (developmentRequest || libraryRead) {
				response.setHeader("Access-Control-Allow-Origin", request.headers.origin);
				response.setHeader("Vary", "Origin");
			}
			if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
				if (!developmentRequest) throw new CatalogError("מקור הבקשה אינו מורשה.", 403);
				response.writeHead(204, {
					...headers,
					"Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type, If-Match",
				});
				return response.end();
			}
			const mutating = !["GET", "HEAD"].includes(request.method);
			if (
				(request.headers["sec-fetch-site"] === "cross-site" &&
					!developmentRequest &&
					!libraryRead) ||
				(mutating && request.headers.origin !== origin && !developmentRequest)
			)
				throw new CatalogError("מקור הבקשה אינו מורשה.", 403);

			if (url.pathname === "/api/sources" && request.method === "GET")
				return json(response, 200, sourceSnapshot(await sources.read(), "local"));
			if (url.pathname === "/api/sources/history" && request.method === "GET")
				return json(response, 200, { history: sourceHistory(await sources.read()) });
			if (url.pathname === "/api/sources" && request.method === "POST")
				return json(
					response,
					200,
					sourceSnapshot(
						await sources.change(request.headers["if-match"], await body(request)),
						"local",
					),
				);
			if (url.pathname === "/api/creator/source-library" && request.method === "GET") {
				const state = await sources.read();
				return json(response, 200, {
					...state.document,
					albums: state.document.albums.filter((album) => album.enabled),
					revision: state.revision,
					updatedAt: state.updatedAt,
				});
			}
			if (
				["/api/creator/kit", "/api/creator/kit-manifest"].includes(url.pathname) &&
				request.method === "GET"
			) {
				const archive = url.pathname.endsWith("/kit");
				let content;
				try {
					content = await readFile(
						resolve(
							creatorKitDirectory,
							archive ? "creator-kit.zip" : "creator-kit.json",
						),
					);
				} catch {
					throw new CatalogError(
						"ערכת היצירה עדיין לא נבנתה. הריצו npm run build:creator-kit.",
						503,
					);
				}
				response.writeHead(200, {
					...headers,
					"Content-Type": archive ? "application/zip" : "application/json",
					...(archive
						? { "Content-Disposition": 'attachment; filename="davinci-creator.zip"' }
						: {}),
				});
				return response.end(content);
			}
			if (
				url.pathname === "/library/catalog.json" &&
				["GET", "HEAD"].includes(request.method)
			) {
				const document = documentOf(await store.read());
				return json(response, 200, request.method === "HEAD" ? undefined : document);
			}
			if (url.pathname === "/api/import" && request.method === "POST") {
				const input = await body(request);
				return json(
					response,
					200,
					payload(
						await store.importCatalog(
							request.headers["if-match"],
							input.catalog,
							input.mode,
						),
					),
				);
			}
			if (url.pathname === "/api/catalog" && request.method === "GET")
				return json(response, 200, payload(await store.read()));
			if (url.pathname === "/api/catalog" && request.method === "PUT") {
				const input = await body(request);
				const state = await store.mutate(
					request.headers["if-match"],
					input.items,
					input.action,
				);
				return json(response, 200, payload(state));
			}
			if (url.pathname === "/api/galleries" && request.method === "POST") {
				const input = await body(request);
				return json(
					response,
					200,
					payload(await store.mutateGallery(request.headers["if-match"], input)),
				);
			}
			if (url.pathname === "/api/source" && request.method === "GET") {
				try {
					return json(response, 200, {
						source,
						catalog: validateDocument(await fetchCatalog()),
					});
				} catch (error) {
					if (error instanceof CatalogError) throw error;
					throw new CatalogError(
						"החיבור לספרייה לא הצליח. אפשר לייבא קובץ JSON במקום.",
						502,
					);
				}
			}
			if (url.pathname === "/api/history" && request.method === "GET") {
				return json(response, 200, { history: await store.history() });
			}
			if (url.pathname === "/api/restore" && request.method === "POST") {
				const input = await body(request);
				if (typeof input.id !== "string" || !input.id)
					throw new CatalogError("יש לבחור גרסה לשחזור.");
				return json(
					response,
					200,
					payload(await store.mutate(request.headers["if-match"], null, null, input.id)),
				);
			}
			if (url.pathname === "/api/export" && request.method === "GET")
				return json(response, 200, documentOf(await store.read()), {
					"Content-Disposition": 'attachment; filename="catalog.json"',
				});
			if (url.pathname.startsWith("/api/")) throw new CatalogError("הפעולה לא נמצאה.", 404);
			if (!["GET", "HEAD"].includes(request.method))
				throw new CatalogError("הפעולה אינה נתמכת.", 405);
			const path = resolve(
				publicDir,
				"." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
			);
			if (!path.startsWith(publicDir + sep)) throw new CatalogError("הקובץ לא נמצא.", 404);
			try {
				if (!(await stat(path)).isFile()) throw new Error("not a file");
				const content = await readFile(path);
				const csp =
					extname(path) === ".html"
						? {
								"Content-Security-Policy": headers[
									"Content-Security-Policy"
								].replace(
									"script-src 'self'",
									"script-src 'self' " +
										[
											...content
												.toString("utf8")
												.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),
										]
											.filter((match) => match[1].trim())
											.map(
												(match) =>
													"'sha256-" +
													createHash("sha256")
														.update(match[1])
														.digest("base64") +
													"'",
											)
											.join(" "),
								),
							}
						: {};
				response.writeHead(200, {
					...headers,
					...csp,
					"Content-Type": types[extname(path)] ?? "application/octet-stream",
				});
				response.end(request.method === "HEAD" ? undefined : content);
			} catch {
				throw new CatalogError("הקובץ לא נמצא.", 404);
			}
		} catch (error) {
			json(response, error instanceof CatalogError ? error.status : 500, {
				error: error instanceof CatalogError ? error.message : "השמירה לא הושלמה. נסו שוב.",
			});
		}
	});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const port = Number(process.env.PORT || 4310);
	if (!Number.isInteger(port) || port < 1 || port > 65535)
		throw new Error("PORT must be an integer between 1 and 65535.");
	const server = createApp();
	server.listen(port, "127.0.0.1", () =>
		console.log(`Da Vinci admin · http://127.0.0.1:${port}`),
	);
	for (const signal of ["SIGINT", "SIGTERM"])
		process.on(signal, () => server.close(() => process.exit(0)));
}
