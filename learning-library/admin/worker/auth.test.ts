import { env } from "cloudflare:test";
import { beforeEach, expect, test, vi } from "vitest";
import { SignJWT, generateKeyPair, exportJWK } from "jose";
import worker from "../src/worker";
import { authDigest, pkceChallenge, verifySsoIdentity } from "../src/admin-sso";
import { permissionProfile } from "../src/admin-permissions";
import type { Env } from "../src/model";
import seed from "../../admin/fixtures/catalog.json";

const origin = "https://knowledge.davinci4744.com";
const actor = "allowed@example.com";
const secret = "test-only-shared-signing-key-0123456789abcdef";
const settings = {
	...env,
	ADMIN_AUTH_MODE: "sso",
	ADMIN_EMAILS: actor,
	ADMIN_SSO_URL: "https://lms.example/redirect?target=jwt",
	ADMIN_SSO_ISSUER: "https://lms.example",
	ADMIN_SSO_AUD: "test-creator-admin",
	ADMIN_SSO_SECRET: secret,
	ADMIN_SSO_LABEL: "Learning platform",
} as unknown as Env;
const bucket = settings.CONTENT;
const encode = (v: string) => new TextEncoder().encode(v);
const call = (path: string, options: RequestInit = {}, config = settings) =>
	worker.fetch(new Request(origin + path, options), config);
const form = (data: Record<string, string>, cookie?: string, site = origin): RequestInit => ({
	method: "POST",
	headers: {
		Origin: site,
		"Content-Type": "application/x-www-form-urlencoded",
		...(cookie ? { Cookie: cookie } : {}),
	},
	body: new URLSearchParams(data),
});
const json = (data: unknown, extra: Record<string, string> = {}): RequestInit => ({
	method: "POST",
	headers: { Origin: origin, "Content-Type": "application/json", ...extra },
	body: JSON.stringify(data),
});
function cookies(response: Response) {
	return [
		...(response.headers.get("Set-Cookie") || "").matchAll(
			/(?:^|,\s*)(__Host-davinci-(?:login|admin)=[^;]+)/g,
		),
	]
		.map((m) => m[1]!)
		.filter((v) => !v.endsWith("="))
		.join("; ");
}
async function token(changes: Record<string, unknown> = {}, key = secret) {
	return new SignJWT({
		uid: 42,
		email: actor,
		iss: settings.ADMIN_SSO_ISSUER,
		aud: settings.ADMIN_SSO_AUD,
		exp: Math.floor(Date.now() / 1000) + 30,
		...changes,
	})
		.setProtectedHeader({ alg: "HS256", typ: "JWT" })
		.sign(encode(key));
}
async function start(next = "/admin/", config = settings) {
	const response = await call("/admin/auth/start", form({ next }), config);
	expect(response.status).toBe(303);
	const provider = new URL(response.headers.get("Location")!);
	expect(provider.origin).toBe("https://lms.example");
	expect(provider.searchParams.get("target")).toBe("jwt");
	return { cookie: cookies(response), callback: new URL(provider.searchParams.get("url")!) };
}
async function login(config = settings, claims: Record<string, unknown> = {}) {
	const flow = await start("/admin/", config);
	flow.callback.searchParams.set("jwt", await token(claims));
	const response = await call(
		flow.callback.pathname + flow.callback.search,
		{
			headers: { Cookie: flow.cookie },
		},
		config,
	);
	expect(response.status).toBe(303);
	expect(response.headers.get("Location")).toBe("/admin/");
	expect(response.headers.get("Set-Cookie")).toContain("Secure; HttpOnly; SameSite=Lax");
	return cookies(response);
}
const csrf = (html: string) => /name="csrf" value="([^"]+)"/.exec(html)![1]!;
async function pairing(cookie: string, config = settings) {
	const verifier = "v".repeat(43);
	const uri = "http://127.0.0.1:47001/callback";
	const query = new URLSearchParams({
		redirect_uri: uri,
		code_challenge: await pkceChallenge(verifier),
		code_challenge_method: "S256",
		state: "s".repeat(43),
	});
	const consent = await call(
		"/admin/auth/agent/authorize?" + query,
		{
			headers: { Cookie: cookie },
		},
		config,
	);
	expect(consent.status).toBe(200);
	expect(consent.headers.get("Content-Security-Policy")).toContain(
		"form-action 'self' http://127.0.0.1:47001;",
	);
	const approval = await call(
		"/admin/auth/agent/approve",
		form({ csrf: csrf(await consent.text()) }, cookie),
		config,
	);
	expect(approval.status).toBe(303);
	const callback = new URL(approval.headers.get("Location")!);
	expect(callback.origin).toBe("http://127.0.0.1:47001");
	expect(callback.searchParams.get("state")).toBe("s".repeat(43));
	return { code: callback.searchParams.get("code")!, code_verifier: verifier, redirect_uri: uri };
}
async function agent(cookie: string, config = settings) {
	const exchange = await call(
		"/admin/auth/agent/token",
		json(await pairing(cookie, config)),
		config,
	);
	expect(exchange.status).toBe(200);
	return (await exchange.json<{ access_token: string }>()).access_token;
}
beforeEach(async () => {
	let cursor: string | undefined;
	do {
		const result = await bucket.list({ cursor });
		if (result.objects.length) await bucket.delete(result.objects.map((o) => o.key));
		cursor = result.truncated ? result.cursor : undefined;
	} while (cursor);
	await bucket.put("library/catalog.json", JSON.stringify(seed));
});

test("migration retains verified Access logins even when SSO is unavailable, without letting agent bearer tokens escape scope checks", async () => {
	const keys = await generateKeyPair("RS256");
	const jwk = await exportJWK(keys.publicKey);
	jwk.kid = "migration-key";
	const config = {
		...settings,
		ADMIN_AUTH_MODE: "migration",
		ADMIN_ACCESS_ISSUER: "https://migration-test.cloudflareaccess.com",
		ADMIN_ACCESS_AUD: "migration-audience",
	};
	const access = await new SignJWT({ email: actor })
		.setProtectedHeader({ alg: "RS256", kid: jwk.kid })
		.setIssuer(config.ADMIN_ACCESS_ISSUER)
		.setAudience(config.ADMIN_ACCESS_AUD)
		.setSubject("existing-user")
		.setIssuedAt()
		.setExpirationTime("10m")
		.sign(keys.privateKey);
	const network = vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async () => Response.json({ keys: [jwk] }));
	try {
		const headers = { "Cf-Access-Jwt-Assertion": access };
		for (const current of [config, { ...config, ADMIN_SSO_SECRET: undefined }]) {
			const response = await call("/admin/api/catalog", { headers }, current);
			expect(response.status).toBe(200);
			await response.text();
		}
		expect(
			(
				await call(
					"/admin/api/catalog",
					{ headers: { ...headers, Authorization: "Bearer forged" } },
					config,
				)
			).status,
		).toBe(401);
		const grant = await agent(await login());
		expect(
			(
				await call(
					"/admin/api/history",
					{ headers: { ...headers, Authorization: "Bearer " + grant } },
					config,
				)
			).status,
		).toBe(403);
		expect((await call("/admin/auth/login", {}, config)).status).toBe(200);
	} finally {
		network.mockRestore();
	}
});

test("SSO validates actual numeric/string uid, email policy, algorithm, issuer, audience and short expiry", async () => {
	expect(await verifySsoIdentity(await token(), settings)).toEqual({
		uid: "42",
		email: actor,
		actor,
		label: actor,
	});
	expect(
		await verifySsoIdentity(await token({ uid: "42", email: actor.toUpperCase() }), settings),
	).toEqual({ uid: "42", email: actor, actor, label: actor });
	for (const change of [
		{ uid: 0 },
		{ uid: null },
		{ uid: 1.5 },
		{ email: "other@example.com" },
		{ aud: [settings.ADMIN_SSO_AUD] },
		{ aud: "other" },
		{ iss: "https://other.example" },
		{ exp: 1 },
		{ exp: Math.floor(Date.now() / 1000) + 3600 },
	])
		await expect(verifySsoIdentity(await token(change), settings)).rejects.toMatchObject({
			status: 403,
		});
	await expect(
		verifySsoIdentity(await token({}, "different-test-only-key-012345678901234"), settings),
	).rejects.toMatchObject({ status: 403 });
	await expect(
		verifySsoIdentity(await token(), { ...settings, ADMIN_SSO_SECRET: "short" }),
	).rejects.toMatchObject({ status: 503 });
});

test("only a state-bound single-use handoff creates a private browser session", async () => {
	const flow = await start("https://untrusted.example/");
	const signed = await token();
	flow.callback.searchParams.set("jwt", signed);
	const missing = await call(flow.callback.pathname + flow.callback.search);
	expect(missing.status).toBe(400);
	expect(missing.headers.get("Referrer-Policy")).toBe("no-referrer");
	await missing.text();
	const bad = new URL(flow.callback);
	bad.searchParams.set("state", "wrong");
	expect(
		(await call(bad.pathname + bad.search, { headers: { Cookie: flow.cookie } })).status,
	).toBe(400);
	const success = await call(flow.callback.pathname + flow.callback.search, {
		headers: { Cookie: flow.cookie },
	});
	expect(success.status).toBe(303);
	expect(success.headers.get("Location")).toBe("/admin/");
	expect(success.headers.get("Referrer-Policy")).toBe("no-referrer");
	const session = cookies(success);
	const read = await call("/admin/api/catalog", { headers: { Cookie: session } });
	expect(read.status).toBe(200);
	await read.text();
	const reused = await start();
	reused.callback.searchParams.set("jwt", signed);
	expect(
		(
			await call(reused.callback.pathname + reused.callback.search, {
				headers: { Cookie: reused.cookie },
			})
		).status,
	).toBe(400);
	expect(
		(
			await call("/admin/api/catalog", {
				headers: {
					"Cf-Access-Authenticated-User-Email": actor,
					"Cf-Access-Jwt-Assertion": signed,
				},
			})
		).status,
	).toBe(401);
	const privateObjects = await bucket.list({ prefix: "private/admin-auth/" });
	for (const object of privateObjects.objects) {
		const response = await call("/" + object.key);
		expect(response.status).toBe(404);
		await response.text();
	}
});

test("unauthenticated UI redirects to login while content writes and incomplete configuration fail closed", async () => {
	const loginPage = await call("/admin/auth/login");
	expect(loginPage.headers.get("Referrer-Policy")).toBe("same-origin");
	expect(loginPage.headers.get("Content-Security-Policy")).toContain(
		"form-action 'self' https://lms.example;",
	);
	await loginPage.text();
	expect((await call("/admin/auth/start", form({}, undefined, "null"))).status).toBe(403);
	expect((await call("/admin/")).headers.get("Location")).toContain("/admin/auth/login");
	expect((await call("/admin/api/catalog")).status).toBe(401);
	expect(
		(await call("/admin/api/catalog", { ...json({ items: [] }), method: "PUT" })).status,
	).toBe(401);
	expect(
		(await call("/admin/auth/start", form({}, undefined, "https://attacker.example"))).status,
	).toBe(403);
	expect(
		(await call("/admin/auth/start", form({}), { ...settings, ADMIN_SSO_SECRET: undefined }))
			.status,
	).toBe(503);
	expect(
		(await call("/admin/api/catalog", {}, { ...settings, ADMIN_AUTH_MODE: "typo" })).status,
	).toBe(503);
});

test("agent pairing requires a browser, literal loopback, PKCE and an exact redirect; a code is redeemed once", async () => {
	const browser = await login();
	for (const uri of [
		"https://attacker.example/callback",
		"http://localhost.example:47001/callback",
		"http://127.0.0.1:47001/other",
		"http://127.0.0.1:47001/callback?to=evil",
	]) {
		const query = new URLSearchParams({
			redirect_uri: uri,
			code_challenge: "c".repeat(43),
			code_challenge_method: "S256",
			state: "s".repeat(43),
		});
		expect(
			(await call("/admin/auth/agent/authorize?" + query, { headers: { Cookie: browser } }))
				.status,
		).toBe(400);
	}
	const code = await pairing(browser);
	expect(
		(await call("/admin/auth/agent/token", json({ ...code, code_verifier: "x".repeat(43) })))
			.status,
	).toBe(400);
	expect(
		(
			await call(
				"/admin/auth/agent/token",
				json({ ...code, redirect_uri: "http://127.0.0.1:47002/callback" }),
			)
		).status,
	).toBe(400);
	const results = await Promise.all([
		call("/admin/auth/agent/token", json(code)),
		call("/admin/auth/agent/token", json(code)),
	]);
	expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
	const success = results.find((r) => r.status === 200)!;
	const auth = (await success.json<{ access_token: string }>()).access_token;
	expect(
		(await call("/admin/api/catalog", { headers: { Authorization: "Bearer " + auth } })).status,
	).toBe(200);
	expect(
		(await call("/admin/auth/agent/approve", form({ csrf: "forged" }, browser))).status,
	).toBe(400);
});

test("agent credentials cannot manage galleries/catalog or approve agents, and account revocation takes effect immediately", async () => {
	const browser = await login();
	const auth = await agent(browser);
	const authorization = { Authorization: "Bearer " + auth };
	for (const path of ["/admin/", "/admin/auth/account", "/admin/api/history"])
		expect((await call(path, { headers: authorization })).status).toBe(403);
	for (const path of [
		"/admin/api/catalog",
		"/admin/api/galleries",
		"/admin/api/sources",
		"/admin/auth/agent/approve",
	])
		expect(
			(
				await call(path, {
					...json({}, authorization),
					method: path.endsWith("catalog") ? "PUT" : "POST",
				})
			).status,
		).toBe(403);
	expect(
		(await call("/admin/api/creator/source-library", { headers: authorization })).status,
	).toBe(200);
	expect((await call("/admin/api/creator/source-library", json({}, authorization))).status).toBe(
		405,
	);
	const account = await call("/admin/auth/account", { headers: { Cookie: browser } });
	const html = await account.text();
	expect(html).not.toContain(auth);
	expect(html).toContain("ביטול הרשאה");
	const id = await authDigest(auth);
	expect(
		(
			await call(
				"/admin/auth/revoke",
				form({ csrf: csrf(html), id }, browser, "https://attacker.example"),
			)
		).status,
	).toBe(403);
	expect((await call("/admin/auth/revoke", form({ csrf: csrf(html), id }, browser))).status).toBe(
		303,
	);
	expect((await call("/admin/api/catalog", { headers: authorization })).status).toBe(401);
	expect(
		(
			await call(
				"/admin/api/catalog",
				{ headers: { Cookie: browser } },
				{ ...settings, ADMIN_EMAILS: "other@example.com" },
			)
		).status,
	).toBe(401);
	expect(
		(
			await call(
				"/admin/api/catalog",
				{ headers: { Cookie: browser } },
				{ ...settings, ADMIN_SSO_SECRET: secret + "rotated" },
			)
		).status,
	).toBe(401);
	expect((await call("/admin/auth/logout", form({ csrf: csrf(html) }, browser))).status).toBe(
		303,
	);
	expect((await call("/admin/api/catalog", { headers: { Cookie: browser } })).status).toBe(401);
});

test("a paired agent publishes a complete package through the actual authenticated Worker and retains recovery history", async () => {
	const auth = await agent(await login());
	const authorization = { Authorization: "Bearer " + auth, Origin: origin };
	const loaded = await call("/admin/api/catalog", { headers: authorization });
	const catalog = await loaded.json<{
		revision: string;
		items: Record<string, unknown>[];
		galleries: unknown[];
	}>();
	const payloads = [
		"poster",
		"<!doctype html><title>SSO presentation</title>",
		"private editable source",
	];
	const paths = [
		"media/sso-publish-test/poster.jpg",
		"media/sso-publish-test/deck.html",
		"sources/sso-publish-test.zip",
	];
	const files = await Promise.all(
		paths.map(async (path, i) => ({
			path,
			size: encode(payloads[i]!).length,
			hashes: [await authDigest(payloads[i]!)],
		})),
	);
	const item = {
		...catalog.items[0]!,
		id: "sso-publish-test",
		title: "SSO presentation",
		poster: "library/" + paths[0],
		deck: "library/" + paths[1],
		powerpoint: null,
		video: null,
		scorm: {},
		gallery: "none",
	};
	const begin = await call(
		"/admin/api/creator/uploads",
		json(
			{ catalog: { schemaVersion: 1, galleries: catalog.galleries, items: [item] }, files },
			{ ...authorization, "If-Match": catalog.revision },
		),
	);
	expect(begin.status).toBe(201);
	const { id } = await begin.json<{ id: string }>();
	for (let i = 0; i < files.length; i++) {
		const base = `/admin/api/creator/uploads/${id}/files/${i}`;
		expect((await call(base, { method: "POST", headers: authorization })).status).toBe(200);
		const part = await call(base + "/parts/1", {
			method: "PUT",
			headers: { ...authorization, "Content-Type": "application/octet-stream" },
			body: encode(payloads[i]!),
		});
		expect(part.status).toBe(200);
		expect(
			(await call(base + "/complete", json({ parts: [await part.json()] }, authorization)))
				.status,
		).toBe(200);
	}
	const published = await call(`/admin/api/creator/uploads/${id}/publish`, {
		method: "POST",
		headers: authorization,
	});
	expect(published.status).toBe(200);
	await published.text();
	const after = await (
		await call("/library/catalog.json")
	).json<{ items: { id: string; deck: string }[] }>();
	const saved = after.items.find((i) => i.id === "sso-publish-test")!;
	expect(saved.deck).toMatch(/^library\/releases\//);
	expect(await (await call("/" + saved.deck)).text()).toContain("SSO presentation");
	expect((await bucket.list({ prefix: "library/admin-history/" })).objects).toHaveLength(1);
	expect((await call("/admin/auth/agent/logout", json({}, authorization))).status).toBe(200);
	expect((await call("/admin/api/catalog", { headers: authorization })).status).toBe(401);
});

const fieldSettings: Env = {
	...settings,
	ADMIN_EMAILS: undefined,
	ADMIN_SSO_AUTHORIZATION: "remote-field",
	ADMIN_PERMISSION_URL: "https://lms.example/user-permission",
	ADMIN_PERMISSION_AUTH: "basic",
	ADMIN_PERMISSION_USER: "test-api-reader",
	ADMIN_PERMISSION_SECRET: "test-api-password",
	ADMIN_PERMISSION_DOMAIN: "7",
	ADMIN_PERMISSION_KEY: "library_manager",
	ADMIN_PERMISSION_LABEL: "Library manager",
};
function remoteUser(changes: Record<string, unknown> = {}) {
	return {
		user_id: "42",
		domain_id: "7",
		user_name: "creator",
		user_enabled: "1",
		user_expiration: null,
		full_name: "Test creator",
		user_email: null,
		"Library manager": "1",
		unrelated_private_data: "never persist this profile",
		...changes,
	};
}

test("a checked remote field authorizes a signed identity without email and stores only a minimal permission snapshot", async () => {
	const network = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
		expect(String(input)).toBe(fieldSettings.ADMIN_PERMISSION_URL);
		expect(options?.redirect).toBe("manual");
		expect(new Headers(options?.headers).get("Authorization")).toBe(
			"Basic " + btoa("test-api-reader:test-api-password"),
		);
		expect(JSON.parse(String(options?.body))).toEqual({
			user_identifier: { user_id: "42", domain: "7" },
		});
		return Response.json({ user_details: remoteUser() });
	});
	try {
		const identity = await verifySsoIdentity(await token({ email: undefined }), fieldSettings);
		expect(identity).toMatchObject({
			uid: "42",
			label: "Test creator",
			actor: expect.stringMatching(/^sso:/),
		});
		expect(identity.email).toBeUndefined();
		const browser = await login(fieldSettings, { email: undefined });
		const read = await call(
			"/admin/api/catalog",
			{ headers: { Cookie: browser } },
			fieldSettings,
		);
		expect(read.status).toBe(200);
		await read.text();
		const grants = await bucket.list({ prefix: "private/admin-auth/" });
		for (const grant of grants.objects)
			expect(await (await bucket.get(grant.key))!.text()).not.toContain(
				"never persist this profile",
			);
	} finally {
		network.mockRestore();
	}
});

test("unchecked fields, wrong users/tenants, disabled or expired accounts and ambiguous fields cannot authorize access", async () => {
	let details = remoteUser();
	const network = vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async () => Response.json({ user_details: details }));
	try {
		for (const value of [false, 0, "0", null, "true", "yes"]) {
			details = remoteUser({ "Library manager": value });
			await expect(
				permissionProfile(fieldSettings, settings.ADMIN_SSO_ISSUER!, "42", true),
			).rejects.toMatchObject({ status: 403 });
		}
		for (const change of [
			{ user_id: "43" },
			{ domain_id: "8" },
			{ user_enabled: "0" },
			{ user_name: "" },
			{ user_expiration: 1 },
			{ library_manager: "0" },
		]) {
			details = remoteUser(change);
			await expect(
				permissionProfile(fieldSettings, settings.ADMIN_SSO_ISSUER!, "42", true),
			).rejects.toMatchObject({ status: 403 });
		}
		for (const value of [true, 1, "1"]) {
			details = remoteUser({ "Library manager": value });
			expect(
				(await permissionProfile(fieldSettings, settings.ADMIN_SSO_ISSUER!, "42", true))
					.uid,
			).toBe("42");
		}
	} finally {
		network.mockRestore();
	}
});

test("existing browser and agent credentials lose library access within the bounded permission cache after the field is cleared", async () => {
	let allowed = true;
	const network = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
		Response.json({
			user_details: remoteUser({ "Library manager": allowed ? "1" : null }),
		}),
	);
	let clock: ReturnType<typeof vi.spyOn> | undefined;
	try {
		const browser = await login(fieldSettings, { email: undefined });
		const grant = await agent(browser, fieldSettings);
		const authorization = { Authorization: "Bearer " + grant };
		expect(
			(await call("/admin/api/catalog", { headers: authorization }, fieldSettings)).status,
		).toBe(200);
		allowed = false;
		clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
		expect(
			(await call("/admin/api/catalog", { headers: authorization }, fieldSettings)).status,
		).toBe(403);
		expect(
			(await call("/admin/api/catalog", { headers: { Cookie: browser } }, fieldSettings))
				.status,
		).toBe(403);
		// Revoking one's own grant stays possible after role removal.
		expect(
			(await call("/admin/auth/agent/logout", json({}, authorization), fieldSettings)).status,
		).toBe(200);
	} finally {
		clock?.mockRestore();
		network.mockRestore();
	}
});

test("the field is rechecked when an agent redeems approval, not only when its browser logged in", async () => {
	let allowed = true;
	const network = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
		Response.json({
			user_details: remoteUser({ "Library manager": allowed ? "1" : null }),
		}),
	);
	try {
		const code = await pairing(await login(fieldSettings, { email: undefined }), fieldSettings);
		allowed = false;
		expect((await call("/admin/auth/agent/token", json(code), fieldSettings)).status).toBe(403);
	} finally {
		network.mockRestore();
	}
});

test("permission service errors/redirects fail closed and credentials cannot be sent to another origin", async () => {
	const network = vi.spyOn(globalThis, "fetch").mockImplementation(
		async () =>
			new Response(null, {
				status: 302,
				headers: { Location: "https://untrusted.example" },
			}),
	);
	try {
		await expect(
			permissionProfile(fieldSettings, settings.ADMIN_SSO_ISSUER!, "42", true),
		).rejects.toMatchObject({ status: 503 });
		const count = network.mock.calls.length;
		await expect(
			permissionProfile(
				{
					...fieldSettings,
					ADMIN_PERMISSION_URL: "https://untrusted.example/user-permission",
				},
				settings.ADMIN_SSO_ISSUER!,
				"42",
				true,
			),
		).rejects.toMatchObject({ status: 503 });
		expect(network.mock.calls).toHaveLength(count);
		network.mockResolvedValue(Response.json({ res: "error" }));
		await expect(
			verifySsoIdentity(await token({ email: undefined }), fieldSettings),
		).rejects.toMatchObject({ status: 503 });
	} finally {
		network.mockRestore();
	}
});
