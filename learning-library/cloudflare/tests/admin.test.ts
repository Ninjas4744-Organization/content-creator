import { env, SELF } from "cloudflare:test";
import { beforeEach, expect, test, vi } from "vitest";
import { SignJWT, generateKeyPair, createLocalJWKSet, exportJWK } from "jose";
import worker from "../src/worker";
import { adminApi } from "../src/admin";
import { authenticateAdmin, verifyAdminToken } from "../src/admin-access";
import { R2CatalogStorage } from "../src/admin-storage";
import {
	CatalogDomain,
	documentOf,
	stateFromDocument,
	validateDocument,
} from "../../admin/server/catalog-domain.mjs";
import seed from "../../admin/fixtures/catalog.json";
import type { Env } from "../src/model";
const settings = {
	...env,
	ADMIN_ACCESS_ISSUER: "https://test-admin.cloudflareaccess.com",
	ADMIN_ACCESS_AUD: "admin-audience",
	ADMIN_EMAILS: "allowed@example.com",
} as unknown as Env;
const origin = "https://knowledge.davinci4744.com";
const actor = "allowed@example.com";
const bucket = settings.CONTENT;
function request(
	path: string,
	method = "GET",
	body?: unknown,
	revision?: string,
	extra: Record<string, string> = {},
) {
	return new Request(origin + "/admin/api/" + path, {
		method,
		headers: {
			...(body === undefined ? {} : { Origin: origin, "Content-Type": "application/json" }),
			...(revision ? { "If-Match": revision } : {}),
			...extra,
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}
async function load() {
	return await (
		await adminApi(request("catalog"), settings, actor)
	).json<{
		revision: string;
		items: typeof seed;
		galleries: { id: string; name: string; url: string }[];
		mode: string;
	}>();
}
beforeEach(async () => {
	const history = await bucket.list({ prefix: "library/admin-history/" });
	if (history.objects.length) await bucket.delete(history.objects.map((object) => object.key));
	await bucket.put("library/catalog.json", JSON.stringify(seed));
});

test("admin writes publish the validated catalog with an R2 etag and retain restorable history", async () => {
	const before = await load();
	expect(before.mode).toBe("production");
	expect(typeof before.revision).toBe("string");
	const items = before.items.map((item, index) =>
		index === 0 ? { ...item, title: "Updated from admin", custom: { retained: true } } : item,
	);
	const response = await adminApi(
		request("catalog", "PUT", { items }, before.revision),
		settings,
		actor,
	);
	expect(response.status).toBe(200);
	const saved = await response.json<{ revision: string }>();
	expect(saved.revision).not.toBe(before.revision);
	const publicRead = await SELF.fetch(origin + "/library/catalog.json");
	const catalog = await publicRead.json<{
		schemaVersion: number;
		items: Record<string, unknown>[];
		galleries: unknown[];
	}>();
	expect(catalog.schemaVersion).toBe(1);
	expect(catalog.items[0]?.title).toBe("Updated from admin");
	expect(catalog.items[0]?.custom).toEqual({ retained: true });
	expect(catalog.galleries).toEqual(before.galleries);
	await expect(
		adminApi(
			request("catalog", "PUT", { items: before.items }, before.revision),
			settings,
			actor,
		),
	).rejects.toMatchObject({ status: 409 });
	const historyResponse = await adminApi(request("history"), settings, actor);
	const history = (
		await historyResponse.json<{ history: { id: string; actor: string; items?: unknown }[] }>()
	).history;
	expect(history).toHaveLength(1);
	expect(history[0]?.actor).toBe(actor);
	expect(history[0]?.items).toBeUndefined();
	const restored = await adminApi(
		request("restore", "POST", { id: history[0]!.id }, saved.revision),
		settings,
		actor,
	);
	expect(restored.status).toBe(200);
	expect((await load()).items).toEqual(before.items);
	const privateRead = await SELF.fetch(
		origin + "/library/admin-history/" + history[0]!.id + ".json",
	);
	expect(privateRead.status).toBe(404);
	await privateRead.text();
});

test("an R2 conditional write cannot overwrite a concurrent publisher", async () => {
	const storage = new R2CatalogStorage(bucket, actor);
	const before = await storage.read();
	const entry = {
		id: crypto.randomUUID(),
		at: new Date().toISOString(),
		action: "stale",
		revision: before.revision,
		items: before.items,
		galleries: before.galleries,
	};
	const next = {
		...before,
		items: before.items.map((item, index) =>
			index === 0 ? { ...item, title: "Stale editor" } : item,
		),
		history: [entry],
	};
	const winner = {
		...documentOf(before),
		items: before.items.map((item, index) =>
			index === 0 ? { ...item, title: "Concurrent publisher" } : item,
		),
	};
	await bucket.put("library/catalog.json", JSON.stringify(winner));
	await expect(storage.write(next, before)).rejects.toMatchObject({ status: 409 });
	expect((await load()).items[0]?.title).toBe("Concurrent publisher");
	expect(await storage.history()).toHaveLength(0);
});

test("production mutations reject missing media, invalid input, CSRF and malformed restore IDs", async () => {
	const before = await load();
	const original = await (await bucket.get("library/catalog.json"))!.text();
	await expect(
		adminApi(request("catalog", "PUT", { items: [{}] }, before.revision), settings, actor),
	).rejects.toMatchObject({ status: 400 });
	await expect(
		adminApi(
			request("catalog", "PUT", { items: before.items }, before.revision, {
				Origin: "https://untrusted.example",
			}),
			settings,
			actor,
		),
	).rejects.toMatchObject({ status: 403 });
	const missing = before.items.map((item, index) =>
		index === 0 ? { ...item, deck: "library/media/new/presentation.html" } : item,
	);
	await expect(
		adminApi(request("catalog", "PUT", { items: missing }, before.revision), settings, actor),
	).rejects.toMatchObject({ status: 400 });
	expect(await (await bucket.get("library/catalog.json"))!.text()).toBe(original);
	await expect(
		adminApi(
			request("restore", "POST", { id: "../../private" }, before.revision),
			settings,
			actor,
		),
	).rejects.toMatchObject({ status: 400 });
	await bucket.put("library/media/new/presentation.html", "<html>New deck</html>");
	expect(
		(
			await adminApi(
				request("catalog", "PUT", { items: missing }, before.revision),
				settings,
				actor,
			)
		).status,
	).toBe(200);
});

test("production library changes and document imports keep catalog metadata and fixed libraries", async () => {
	const before = await load();
	await expect(
		adminApi(
			request("galleries", "POST", { type: "delete", id: "public" }, before.revision),
			settings,
			actor,
		),
	).rejects.toMatchObject({ status: 400 });
	await adminApi(
		request("galleries", "POST", { type: "delete", id: "team" }, before.revision),
		settings,
		actor,
	);
	let current = await load();
	expect(current.galleries.some((gallery) => gallery.id === "team")).toBe(false);
	expect(current.items.filter((item) => item.unlisted && !item.gallery)).toHaveLength(0);
	const catalog = validateDocument({
		schemaVersion: 1,
		galleries: current.galleries,
		items: current.items,
		unknownMetadata: { retained: true },
	});
	await adminApi(
		request("import", "POST", { catalog, mode: "replace" }, current.revision),
		settings,
		actor,
	);
	const exported = await (await adminApi(request("export"), settings, actor)).json();
	expect(exported).toEqual(catalog);
	const store = new CatalogDomain(new R2CatalogStorage(bucket, actor));
	expect(documentOf(await store.read())).toEqual(catalog);
});

test("all admin paths deny access before configuration or without a signed Access identity", async () => {
	const original = await (await bucket.get("library/catalog.json"))!.text();
	for (const path of ["/admin", "/admin/", "/admin/api/catalog", "/admin/_expo/static/test.js"]) {
		const response = await SELF.fetch(origin + path);
		expect(response.status).toBe(503);
		await response.text();
	}
	await expect(
		authenticateAdmin(
			new Request(origin + "/admin/api/catalog", {
				headers: { "Cf-Access-Authenticated-User-Email": actor },
			}),
			settings,
		),
	).rejects.toMatchObject({ status: 401 });
	expect(await (await bucket.get("library/catalog.json"))!.text()).toBe(original);
});

test("Access authorization checks signatures, expiry, issuer, audience and the explicit email allowlist", async () => {
	const key = await generateKeyPair("RS256", { extractable: true });
	const jwk = await exportJWK(key.publicKey);
	jwk.kid = "test-key";
	const keys = createLocalJWKSet({ keys: [jwk] });
	const sign = async (
		options: { email?: string; issuer?: string; audience?: string; expiry?: string } = {},
	) =>
		new SignJWT({ email: options.email ?? actor })
			.setProtectedHeader({ alg: "RS256", kid: jwk.kid })
			.setIssuedAt()
			.setSubject("user-id")
			.setIssuer(options.issuer ?? settings.ADMIN_ACCESS_ISSUER!)
			.setAudience(options.audience ?? settings.ADMIN_ACCESS_AUD!)
			.setExpirationTime(options.expiry ?? "10m")
			.sign(key.privateKey);
	expect(await verifyAdminToken(await sign(), settings, keys)).toBe(actor);
	for (const options of [
		{ email: "other@example.com" },
		{ issuer: "https://other.cloudflareaccess.com" },
		{ audience: "other-app" },
		{ expiry: "-1m" },
	])
		await expect(verifyAdminToken(await sign(options), settings, keys)).rejects.toMatchObject({
			status: 403,
		});
	await expect(verifyAdminToken("forged-header", settings, keys)).rejects.toMatchObject({
		status: 403,
	});
	await expect(
		verifyAdminToken(await sign(), { ...settings, ADMIN_ACCESS_AUD: undefined }, keys),
	).rejects.toMatchObject({ status: 503 });
});

test("a verified Access session serves the admin shell with a strict script policy and can read the live catalog", async () => {
	const key = await generateKeyPair("RS256", { extractable: true });
	const jwk = await exportJWK(key.publicKey);
	jwk.kid = "http-key";
	const token = await new SignJWT({ email: actor })
		.setProtectedHeader({ alg: "RS256", kid: jwk.kid })
		.setIssuedAt()
		.setSubject("owner")
		.setIssuer(settings.ADMIN_ACCESS_ISSUER!)
		.setAudience(settings.ADMIN_ACCESS_AUD!)
		.setExpirationTime("10m")
		.sign(key.privateKey);
	const network = vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async () => Response.json({ keys: [jwk] }));
	try {
		const headers = { "Cf-Access-Jwt-Assertion": token };
		const page = await worker.fetch(new Request(origin + "/admin/", { headers }), settings);
		expect(page.status).toBe(200);
		const policy = page.headers.get("Content-Security-Policy")!;
		expect(policy).toContain("frame-ancestors 'none'");
		expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
		expect(await page.text()).toContain("/admin/_expo/");
		const read = await worker.fetch(
			new Request(origin + "/admin/api/catalog", { headers }),
			settings,
		);
		expect(read.status).toBe(200);
		expect((await read.json<{ mode: string }>()).mode).toBe("production");
	} finally {
		network.mockRestore();
	}
});
