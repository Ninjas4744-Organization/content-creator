import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { request } from "node:http";
import { createApp } from "../server/index.mjs";

async function app(t, options = {}) {
	const directory = await mkdtemp(join(tmpdir(), "davinci-admin-http-"));
	await writeFile(
		join(directory, "index.html"),
		'<html dir="rtl"><script>window.EXPO_TEST=true;</script></html>',
	);
	const server = createApp({
		dataFile: join(directory, "workspace.json"),
		staticDirectory: directory,
		devOrigin: null,
		fetchCatalog: async () => [],
		...options,
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(async () => {
		await new Promise((resolve) => server.close(resolve));
		await rm(directory, { recursive: true, force: true });
	});
	const origin = `http://127.0.0.1:${server.address().port}`;
	const get = (path) => fetch(origin + path);
	const put = (body, extra = {}) =>
		fetch(origin + "/api/catalog", {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Origin: origin,
				"If-Match": "0",
				...extra,
			},
			body: JSON.stringify(body),
		});
	return { origin, get, put };
}

test("serves the app and catalog; exports the shared catalog document without admin fields", async (t) => {
	const { get } = await app(t);
	const page = await get("/");
	assert.equal(page.status, 200);
	assert.match(await page.text(), /dir="rtl"/);
	assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
	assert.match(page.headers.get("content-security-policy"), /script-src 'self' 'sha256-/);
	assert.doesNotMatch(
		page.headers.get("content-security-policy"),
		/script-src[^;]*unsafe-inline/,
	);
	const { items, revision } = await (await get("/api/catalog")).json();
	assert.equal(revision, 0);
	assert.equal(items.length, 14);
	const exported = await get("/api/export");
	assert.match(exported.headers.get("content-disposition"), /catalog.json/);
	const document = await exported.json();
	assert.equal(document.schemaVersion, 1);
	assert.deepEqual(document.items, items);
	assert.equal(document.galleries.length, 4);
	assert.equal(document.revision, undefined);
	assert.equal(document.history, undefined);
	const history = await (await get("/api/history")).json();
	assert.deepEqual(history, { history: [] });
	assert.equal((await get("/data/workspace.json")).status, 404);
	assert.equal((await get("/server/index.mjs")).status, 404);
});

test("creator kit downloads use only their build directory and stay read-only locally", async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "davinci-creator-kit-"));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await writeFile(join(directory, "creator-kit.zip"), "test zip bytes");
	await writeFile(join(directory, "creator-kit.json"), JSON.stringify({ version: "test" }));
	const { origin, get } = await app(t, { creatorKitDirectory: directory });
	const kit = await get("/api/creator/kit");
	assert.equal(kit.status, 200);
	assert.equal(kit.headers.get("content-type"), "application/zip");
	assert.match(kit.headers.get("content-disposition"), /davinci-creator.zip/);
	assert.equal(await kit.text(), "test zip bytes");
	assert.deepEqual(await (await get("/api/creator/kit-manifest")).json(), { version: "test" });
	const upload = await fetch(origin + "/api/creator/uploads", {
		method: "POST",
		headers: { Origin: origin },
	});
	assert.equal(upload.status, 404);
	assert.equal((await get("/api/creator/../../data/workspace.json")).status, 404);
});

test("only an explicitly configured Expo development origin can make cross-origin requests", async (t) => {
	const devOrigin = "http://localhost:8081";
	const { origin, get } = await app(t, { devOrigin });
	const { items } = await (await get("/api/catalog")).json();
	const preflight = await fetch(origin + "/api/catalog", {
		method: "OPTIONS",
		headers: { Origin: devOrigin },
	});
	assert.equal(preflight.status, 204);
	assert.equal(preflight.headers.get("access-control-allow-origin"), devOrigin);
	const saved = await fetch(origin + "/api/catalog", {
		method: "PUT",
		headers: {
			Origin: devOrigin,
			"Sec-Fetch-Site": "cross-site",
			"Content-Type": "application/json",
			"If-Match": "0",
		},
		body: JSON.stringify({ items }),
	});
	assert.equal(saved.status, 200);
	const denied = await fetch(origin + "/api/catalog", {
		method: "OPTIONS",
		headers: { Origin: "https://malicious.example" },
	});
	assert.equal(denied.status, 403);
	assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("enforces local host, same-origin writes, and revision preconditions", async (t) => {
	const { origin, get, put } = await app(t);
	const { items } = await (await get("/api/catalog")).json();
	assert.equal((await put({ items }, { Origin: "https://malicious.example" })).status, 403);
	assert.equal((await put({ items }, { "Sec-Fetch-Site": "cross-site" })).status, 403);
	// Node fetch rewrites Host; use the HTTP client to exercise this boundary.
	const hostStatus = await new Promise((resolve, reject) => {
		const req = request(
			origin + "/api/catalog",
			{ headers: { Host: "malicious.example" } },
			(response) => {
				response.resume();
				resolve(response.statusCode);
			},
		);
		req.on("error", reject);
		req.end();
	});
	assert.equal(hostStatus, 403);
	assert.equal((await put({ items }, { "If-Match": "999" })).status, 409);
	assert.equal((await put({ items }, { "Content-Type": "text/plain" })).status, 415);
	assert.equal((await put({ items })).status, 200);
	assert.equal((await put({ items })).status, 409);
});

test("API updates, history, and restore preserve metadata and media", async (t) => {
	const { origin, get, put } = await app(t);
	const before = await (await get("/api/catalog")).json();
	const items = structuredClone(before.items);
	items[0] = {
		...items[0],
		title: "עדכון מהאתר",
		featured: false,
		gallery: "none",
		unlisted: true,
		future: { extra: true },
	};
	const saved = await (await put({ items, action: "updated title" })).json();
	assert.equal(saved.revision, 1);
	assert.deepEqual(saved.items[0].scorm, before.items[0].scorm);
	assert.deepEqual(saved.items[0].future, { extra: true });
	const { history } = await (await get("/api/history")).json();
	assert.equal(history[0].items, undefined);
	const response = await fetch(origin + "/api/restore", {
		method: "POST",
		headers: { Origin: origin, "Content-Type": "application/json", "If-Match": "1" },
		body: JSON.stringify({ id: history[0].id }),
	});
	assert.equal(response.status, 200);
	assert.deepEqual((await response.json()).items, before.items);
});

test("rejects invalid JSON, unsafe catalog entries and oversized requests", async (t) => {
	const { origin, put } = await app(t);
	assert.equal((await put({ items: [{}] })).status, 400);
	assert.equal((await put(null)).status, 400);
	const headers = { Origin: origin, "Content-Type": "application/json", "If-Match": "0" };
	assert.equal(
		(await fetch(origin + "/api/catalog", { method: "PUT", headers, body: "{" })).status,
		400,
	);
	assert.equal(
		(
			await fetch(origin + "/api/catalog", {
				method: "PUT",
				headers,
				body: JSON.stringify({ padding: "x".repeat(4 * 1024 * 1024) }),
			})
		).status,
		413,
	);
});

test("gallery API enforces boundaries, protects fixed galleries, and restores deleted libraries with their content", async (t) => {
	const { origin, get, put } = await app(t);
	const before = await (await get("/api/catalog")).json();
	const change = (input, revision = 0, extra = {}) =>
		fetch(origin + "/api/galleries", {
			method: "POST",
			headers: {
				Origin: origin,
				"Content-Type": "application/json",
				"If-Match": String(revision),
				...extra,
			},
			body: JSON.stringify(input),
		});
	assert.equal(before.galleries.length, 4);
	assert.equal(
		(await change({ type: "delete", id: "team" }, 0, { Origin: "https://malicious.example" }))
			.status,
		403,
	);
	assert.equal(
		(await change({ type: "delete", id: "team" }, 0, { "Sec-Fetch-Site": "cross-site" }))
			.status,
		403,
	);
	assert.equal(
		(await change({ type: "create", name: "הדרכות" }, 0, { "If-Match": "" })).status,
		409,
	);
	for (const id of ["public", "none"]) {
		assert.equal((await change({ type: "rename", id, name: "שינוי" })).status, 400);
		assert.equal((await change({ type: "delete", id })).status, 400);
	}
	assert.equal((await change({ type: "create", name: "" })).status, 400);
	assert.equal((await change({ type: "create", name: "ספריית הקבוצה" })).status, 400);
	assert.equal((await change({ type: "delete", id: "missing" })).status, 404);
	assert.equal((await change({ type: "delete", id: "team" }, 99)).status, 409);
	assert.deepEqual(await (await get("/api/catalog")).json(), before);
	const createdResponse = await change({ type: "create", name: "הדרכות" });
	assert.equal(createdResponse.status, 200);
	const created = await createdResponse.json();
	const id = created.galleries.at(-1).id;
	const renamedResponse = await change(
		{ type: "update", id, name: "הדרכות חדשות", url: "/robotics" },
		1,
	);
	assert.equal(renamedResponse.status, 200);
	assert.equal((await renamedResponse.json()).galleries.at(-1).name, "הדרכות חדשות");
	const items = created.items.map((item, index) =>
		index === 0 ? { ...item, gallery: id, unlisted: true } : item,
	);
	const assigned = await put({ items }, { "If-Match": "2" });
	assert.equal(assigned.status, 200);
	const deletedResponse = await change({ type: "delete", id }, 3);
	assert.equal(deletedResponse.status, 200);
	const deleted = await deletedResponse.json();
	assert.deepEqual(deleted.items[0], { ...items[0], gallery: "none", unlisted: true });
	assert.ok(!deleted.galleries.some((gallery) => gallery.id === id));
	assert.deepEqual((await (await get("/api/export")).json()).items, deleted.items);
	const { history } = await (await get("/api/history")).json();
	assert.equal(history[0].galleries, undefined);
	const restoredResponse = await fetch(origin + "/api/restore", {
		method: "POST",
		headers: { Origin: origin, "Content-Type": "application/json", "If-Match": "4" },
		body: JSON.stringify({ id: history[0].id }),
	});
	assert.equal(restoredResponse.status, 200);
	const restored = await restoredResponse.json();
	assert.deepEqual(restored.items, items);
	assert.equal(restored.galleries.at(-1).name, "הדרכות חדשות");
	assert.equal(restored.galleries.at(-1).url, "/robotics");
});

test("gallery URL updates reject unsafe links and fixed destinations at the HTTP boundary", async (t) => {
	const { origin, get } = await app(t);
	const before = await (await get("/api/catalog")).json();
	const update = (id, url) =>
		fetch(origin + "/api/galleries", {
			method: "POST",
			headers: { Origin: origin, "Content-Type": "application/json", "If-Match": "0" },
			body: JSON.stringify({
				type: "update",
				id,
				name: before.galleries.find((gallery) => gallery.id === id).name,
				url,
			}),
		});
	assert.equal((await update("team", "javascript:alert(1)")).status, 400);
	assert.equal((await update("team", "//example.org")).status, 400);
	assert.equal((await update("team", null)).status, 400);
	assert.equal((await update("public", "/other")).status, 400);
	assert.equal((await update("none", "/other")).status, 400);
	assert.deepEqual(await (await get("/api/catalog")).json(), before);
	const response = await update("team", "https://courses.example.org/learning?lang=he");
	assert.equal(response.status, 200);
	const saved = await response.json();
	assert.equal(
		saved.galleries.find((gallery) => gallery.id === "team").url,
		"https://courses.example.org/learning?lang=he",
	);
	assert.deepEqual(saved.items, before.items);
});

test("admin export, local library reads, and import share one catalog document", async (t) => {
	const libraryOrigin = "http://localhost:8082";
	const { origin, get } = await app(t, { libraryOrigin });
	const before = await (await get("/api/export")).json();
	const custom = { id: "robotics", name: "רובוטיקה", url: "/robotics" };
	const catalog = {
		...before,
		galleries: [before.galleries[0], before.galleries[3], custom],
		items: [{ ...before.items[0], gallery: custom.id }],
		future: { retained: true },
	};
	const imported = await fetch(origin + "/api/import", {
		method: "POST",
		headers: { Origin: origin, "Content-Type": "application/json", "If-Match": "0" },
		body: JSON.stringify({ catalog, mode: "replace" }),
	});
	assert.equal(imported.status, 200);
	const exported = await (await get("/api/export")).json();
	assert.deepEqual(exported, catalog);
	const read = await fetch(origin + "/library/catalog.json", {
		headers: { Origin: libraryOrigin, "Sec-Fetch-Site": "cross-site" },
	});
	assert.equal(read.status, 200);
	assert.equal(read.headers.get("Access-Control-Allow-Origin"), libraryOrigin);
	assert.deepEqual(await read.json(), catalog);
	const write = await fetch(origin + "/api/import", {
		method: "POST",
		headers: { Origin: libraryOrigin, "Content-Type": "application/json", "If-Match": "1" },
		body: JSON.stringify({ catalog, mode: "replace" }),
	});
	assert.equal(write.status, 403);
	const denied = await fetch(origin + "/library/catalog.json", {
		headers: { Origin: "https://untrusted.example", "Sec-Fetch-Site": "cross-site" },
	});
	assert.equal(denied.status, 403);
	assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
	const admin = await (await get("/api/catalog")).json();
	assert.equal(admin.revision, 1);
	assert.deepEqual(admin.items, catalog.items);
	assert.deepEqual(admin.galleries, catalog.galleries);
});

test("public source accepts new documents and normalizes legacy arrays", async (t) => {
	const legacy = await app(t);
	const catalog = await (await legacy.get("/api/export")).json();
	const fresh = await app(t, {
		fetchCatalog: async () => ({ ...catalog, custom: { retained: true } }),
	});
	const source = await (await fresh.get("/api/source")).json();
	assert.deepEqual(source.catalog, { ...catalog, custom: { retained: true } });
	const older = await app(t, { fetchCatalog: async () => catalog.items });
	assert.deepEqual((await (await older.get("/api/source")).json()).catalog.items, catalog.items);
});

test("source API shares active albums with creators and enforces origin, validation, revisions and recovery", async (t) => {
	const { origin, get } = await app(t);
	const before = await (await get("/api/sources")).json();
	assert.equal(before.albums.length, 3);
	const album = {
		...before.albums[0],
		context: "עבודת צוות בתחרות",
		tags: ["צוות"],
		enabled: false,
	};
	const change = (input, revision = "0", site = origin) =>
		fetch(origin + "/api/sources", {
			method: "POST",
			headers: { Origin: site, "Content-Type": "application/json", "If-Match": revision },
			body: JSON.stringify(input),
		});
	assert.equal((await change({ type: "update", album }, "0", "https://evil.test")).status, 403);
	assert.equal((await change({ type: "update", album }, "")).status, 409);
	assert.equal(
		(await change({ type: "create", album: { ...album, url: "https://evil.test" } })).status,
		400,
	);
	assert.equal((await change({ type: "update", album })).status, 200);
	assert.equal((await change({ type: "delete", id: album.id })).status, 409);
	const active = await (await get("/api/creator/source-library")).json();
	assert.equal(active.albums.length, 2);
	assert.ok(!active.albums.some((entry) => entry.id === album.id));
	assert.equal(active.history, undefined);
	const { history } = await (await get("/api/sources/history")).json();
	assert.equal(history[0].document, undefined);
	assert.equal((await change({ type: "restore", id: history[0].id }, "1")).status, 200);
	assert.deepEqual((await (await get("/api/sources")).json()).albums, before.albums);
	assert.equal((await get("/data/sources.json")).status, 404);
	assert.equal((await get("/library/photo-albums.json")).status, 404);
	assert.equal((await get("/api/export")).status, 200);
	assert.equal((await (await get("/api/export")).json()).albums, undefined);
});
