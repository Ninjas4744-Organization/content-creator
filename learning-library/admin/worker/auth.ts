import { jwtVerify, SignJWT } from "jose";
import { CatalogError } from "../server/catalog-domain.mjs";

export interface AuthEnv {
	CONTENT: R2Bucket;
	ADMIN_AUTH_MODE?: string;
	ADMIN_EMAILS?: string;
	ADMIN_SSO_URL?: string;
	ADMIN_SSO_ISSUER?: string;
	ADMIN_SSO_AUD?: string;
	ADMIN_SSO_SECRET?: string;
	ADMIN_SSO_LABEL?: string;
}
interface Identity {
	email: string;
	uid: string;
}
interface Credential extends Identity {
	kind: "browser" | "agent";
	expires: number;
	epoch: string;
}
export interface AdminIdentity extends Credential {
	id: string;
	key: string;
}
interface Settings {
	url: URL;
	issuer: string;
	audience: string;
	secret: Uint8Array;
	emails: string[];
	label: string;
	epoch: string;
	cookieKey: Uint8Array;
}
const root = "private/admin-auth/";
const sessionCookie = "__Host-davinci-admin";
const loginCookie = "__Host-davinci-login";
const now = () => Math.floor(Date.now() / 1000);
const encode = (value: string) => new TextEncoder().encode(value);
const headers = {
	"Cache-Control": "no-store",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Content-Security-Policy":
		"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
function fail(message = "יש להתחבר מחדש לניהול הספרייה.", status = 401): never {
	throw new CatalogError(message, status);
}
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const escape = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
	);
const redirect = (location: string, cookies: string[] = []) => {
	const response = new Response(null, {
		status: 303,
		headers: { ...headers, Location: location },
	});
	for (const value of cookies) response.headers.append("Set-Cookie", value);
	return response;
};
const cookie = (name: string, value: string, ttl: number) =>
	`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${ttl}`;
function readCookie(request: Request, name: string): string | null {
	const values = (request.headers.get("Cookie") || "")
		.split(";")
		.map((v) => v.trim())
		.filter((v) => v.startsWith(name + "="));
	return values.length === 1 ? values[0]!.slice(name.length + 1) : null;
}
export async function authDigest(value: string): Promise<string> {
	return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encode(value))))
		.map((n) => n.toString(16).padStart(2, "0"))
		.join("");
}
const random = () =>
	btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
export async function pkceChallenge(verifier: string): Promise<string> {
	return btoa(
		String.fromCharCode(
			...new Uint8Array(await crypto.subtle.digest("SHA-256", encode(verifier))),
		),
	)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
export function ssoEnabled(env: AuthEnv): boolean {
	if (env.ADMIN_AUTH_MODE && !["access", "migration", "sso"].includes(env.ADMIN_AUTH_MODE))
		fail("הכניסה לניהול אינה מוגדרת.", 503);
	return env.ADMIN_AUTH_MODE === "sso" || env.ADMIN_AUTH_MODE === "migration";
}
async function settings(env: AuthEnv): Promise<Settings> {
	try {
		const url = new URL(env.ADMIN_SSO_URL || "");
		const issuer = env.ADMIN_SSO_ISSUER || "";
		const emails = (env.ADMIN_EMAILS || "")
			.split(",")
			.map((v) => v.trim().toLowerCase())
			.filter(Boolean);
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.hash ||
			!issuer.startsWith("https://") ||
			!env.ADMIN_SSO_AUD ||
			!emails.length ||
			encode(env.ADMIN_SSO_SECRET || "").length < 32
		)
			throw new Error();
		const secret = encode(env.ADMIN_SSO_SECRET!);
		const key = await crypto.subtle.importKey(
			"raw",
			secret,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const cookieKey = new Uint8Array(
			await crypto.subtle.sign("HMAC", key, encode("davinci-admin-browser-transactions-v1")),
		);
		return {
			url,
			issuer,
			audience: env.ADMIN_SSO_AUD,
			secret,
			emails,
			label: env.ADMIN_SSO_LABEL || "מערכת הלמידה",
			epoch: await authDigest(
				issuer + "\n" + env.ADMIN_SSO_AUD + "\n" + env.ADMIN_SSO_SECRET,
			),
			cookieKey,
		};
	} catch {
		return fail("הכניסה לניהול עדיין אינה מוגדרת.", 503);
	}
}
function page(title: string, body: string, status = 200): Response {
	return new Response(
		`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} · דה וינצ׳י 4744</title><style>@font-face{font-family:Rubik;src:url('/library/brand/Rubik-Regular.ttf')}*{box-sizing:border-box}body{margin:0;background:#f2f5f5;color:#213b44;font:16px/1.8 Rubik,Arial,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px}main{width:100%;max-width:560px;background:white;padding:36px;border:1px solid #dce4e4;border-radius:14px}h1{font-size:26px;line-height:1.4;margin-top:0}p{color:#4e646b}button,.button{display:inline-block;border:0;border-radius:7px;background:#688590;color:white;padding:12px 22px;font:inherit;cursor:pointer;text-decoration:none}a{color:#42616c}input{font:inherit}article{padding:16px 0;border-top:1px solid #dce4e4}small{display:block;color:#4e646b}footer{margin-top:24px;font-size:13px}button:focus-visible,a:focus-visible{outline:3px solid #213b44;outline-offset:3px}</style></head><body><main><h1>${escape(title)}</h1>${body}<footer>דה וינצ׳י 4744 · ספריית הידע</footer></main></body></html>`,
		{
			status,
			// Native form POSTs under no-referrer send Origin: null (Fetch standard).
			headers: {
				...headers,
				"Referrer-Policy": "same-origin",
				"Content-Type": "text/html; charset=utf-8",
			},
		},
	);
}
function sameOrigin(request: Request) {
	if (
		request.headers.get("Origin") !== new URL(request.url).origin ||
		request.headers.get("Sec-Fetch-Site") === "cross-site"
	)
		fail("מקור הבקשה אינו מורשה.", 403);
}
async function input(request: Request, type: "form" | "json"): Promise<Record<string, unknown>> {
	if (
		!request.headers
			.get("Content-Type")
			?.startsWith(type === "form" ? "application/x-www-form-urlencoded" : "application/json")
	)
		fail("סוג בקשה אינו נתמך.", 415);
	const reader = request.body?.getReader();
	let text = "",
		size = 0;
	const decoder = new TextDecoder();
	if (reader)
		while (true) {
			const part = await reader.read();
			if (part.done) break;
			size += part.value.length;
			if (size > 8192) {
				await reader.cancel();
				fail("הבקשה גדולה מדי.", 413);
			}
			text += decoder.decode(part.value, { stream: true });
		}
	text += decoder.decode();
	try {
		const value: unknown =
			type === "form" ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text);
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
		return value as Record<string, unknown>;
	} catch {
		return fail("הבקשה אינה תקינה.", 400);
	}
}
function pairing(url: URL) {
	const uri = url.searchParams.get("redirect_uri") || "";
	let local: URL;
	try {
		local = new URL(uri);
	} catch {
		return fail("כתובת החיבור לסוכן אינה תקינה.", 400);
	}
	const challenge = url.searchParams.get("code_challenge") || "";
	const state = url.searchParams.get("state") || "";
	if (
		local.protocol !== "http:" ||
		local.hostname !== "127.0.0.1" ||
		!local.port ||
		Number(local.port) < 1024 ||
		local.pathname !== "/callback" ||
		local.search ||
		local.hash ||
		local.username ||
		local.password ||
		!/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
		!/^[A-Za-z0-9_-]{43}$/.test(state) ||
		url.searchParams.get("code_challenge_method") !== "S256"
	)
		fail("פרטי החיבור לסוכן אינם תקינים.", 400);
	return { uri, challenge, state };
}
function nextPath(value: unknown, origin: string): string {
	if (value === "/admin/auth/account") return value;
	if (typeof value === "string" && value.startsWith("/admin/auth/agent/authorize?")) {
		const target = new URL(value, origin);
		if (
			target.origin !== origin ||
			target.pathname !== "/admin/auth/agent/authorize" ||
			target.hash
		)
			fail("יעד התחברות אינו מורשה.", 400);
		pairing(target);
		return target.pathname + target.search;
	}
	return "/admin/";
}
async function signed(
	s: Settings,
	origin: string,
	purpose: string,
	data: Record<string, unknown>,
	ttl = 600,
) {
	return new SignJWT({ ...data, purpose })
		.setProtectedHeader({ alg: "HS256", typ: "dv-transaction+jwt" })
		.setIssuer(origin)
		.setAudience(origin)
		.setIssuedAt()
		.setExpirationTime(now() + ttl)
		.sign(s.cookieKey);
}
async function transaction(s: Settings, origin: string, value: unknown, purpose: string) {
	try {
		if (typeof value !== "string" || value.length > 8192) throw new Error();
		const { payload, protectedHeader } = await jwtVerify(value, s.cookieKey, {
			issuer: origin,
			audience: origin,
			algorithms: ["HS256"],
			requiredClaims: ["exp", "iat", "purpose"],
		});
		if (protectedHeader.typ !== "dv-transaction+jwt" || payload.purpose !== purpose)
			throw new Error();
		return payload;
	} catch {
		return fail("בקשת ההתחברות פגה או אינה תקינה. נסו שוב.", 400);
	}
}
async function consume(
	env: AuthEnv,
	key: string,
	data: Record<string, unknown>,
	customMetadata?: Record<string, string>,
) {
	const result = await env.CONTENT.put(root + key, JSON.stringify(data), {
		onlyIf: { etagDoesNotMatch: "*" },
		customMetadata,
		httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
	});
	if (!result) fail("בקשת ההתחברות כבר נוצלה. התחברו מחדש.", 400);
}
export async function verifySsoIdentity(token: string, env: AuthEnv): Promise<Identity> {
	const s = await settings(env);
	try {
		if (token.length > 8192) throw new Error();
		const { payload, protectedHeader } = await jwtVerify(token, s.secret, {
			algorithms: ["HS256"],
			issuer: s.issuer,
			audience: s.audience,
			requiredClaims: ["exp", "uid", "email", "iss", "aud"],
		});
		if (protectedHeader.typ && protectedHeader.typ !== "JWT") throw new Error();
		const uid =
			typeof payload.uid === "number" && Number.isSafeInteger(payload.uid)
				? String(payload.uid)
				: payload.uid;
		if (
			typeof uid !== "string" ||
			!/^[1-9]\d{0,19}$/.test(uid) ||
			typeof payload.email !== "string" ||
			payload.aud !== s.audience ||
			!payload.exp ||
			payload.exp > now() + 45
		)
			throw new Error();
		const email = payload.email.toLowerCase();
		if (!s.emails.includes(email)) throw new Error();
		return { uid, email };
	} catch {
		return fail("אין הרשאה לניהול הספרייה, או שבקשת ההתחברות פגה.", 403);
	}
}
async function issue(env: AuthEnv, s: Settings, identity: Identity, kind: Credential["kind"]) {
	const group = await authDigest(identity.email);
	const token = `dv1.${group}.${random()}`;
	const id = await authDigest(token);
	const ttl = kind === "browser" ? 8 * 3600 : 30 * 86400;
	const record: Credential = { ...identity, kind, expires: now() + ttl, epoch: s.epoch };
	// Private metadata lets the account page list grants without N+1 reads.
	await consume(
		env,
		`credentials/${group}/${kind}/${id}`,
		{ ...record },
		{ kind, expires: String(record.expires), epoch: s.epoch },
	);
	return { token, record, ttl };
}
export async function authenticateSiteAdmin(
	request: Request,
	env: AuthEnv,
	browserOnly = false,
): Promise<AdminIdentity> {
	const s = await settings(env);
	const auth = request.headers.get("Authorization");
	const token = auth
		? /^Bearer (dv1\.[a-f0-9]{64}\.[A-Za-z0-9_-]{43})$/.exec(auth)?.[1] || null
		: readCookie(request, sessionCookie);
	if (!token || !/^dv1\.[a-f0-9]{64}\.[A-Za-z0-9_-]{43}$/.test(token)) fail();
	const [, group] = token.split(".");
	const id = await authDigest(token);
	const key = `${root}credentials/${group}/${auth ? "agent" : "browser"}/${id}`;
	const object = await env.CONTENT.get(key);
	if (!object) fail();
	const value = await object.json<Credential>();
	if (
		!value ||
		!["browser", "agent"].includes(value.kind) ||
		value.expires <= now() ||
		value.epoch !== s.epoch ||
		typeof value.email !== "string" ||
		!s.emails.includes(value.email) ||
		(await authDigest(value.email)) !== group ||
		(auth ? value.kind !== "agent" : value.kind !== "browser")
	)
		fail();
	if (browserOnly && value.kind !== "browser") fail("פעולה זו דורשת התחברות בדפדפן.", 403);
	if (value.kind === "agent") {
		const path = new URL(request.url).pathname;
		if (!(
			(path === "/admin/api/catalog" && request.method === "GET") ||
			path.startsWith("/admin/api/creator/") ||
			path === "/admin/auth/agent/logout" ||
			(path === "/admin/auth/session" && request.method === "GET")
		))
			fail("הרשאת הסוכן מוגבלת לכלי יצירת התוכן.", 403);
	}
	return { ...value, id, key };
}
export function loginRedirect(request: Request): Response {
	return redirect(
		"/admin/auth/login?next=" +
			encodeURIComponent(
				nextPath(
					new URL(request.url).pathname + new URL(request.url).search,
					new URL(request.url).origin,
				),
			),
	);
}
async function browser(request: Request, env: AuthEnv): Promise<AdminIdentity | Response> {
	try {
		return await authenticateSiteAdmin(request, env, true);
	} catch (error) {
		if (error instanceof CatalogError && error.status === 401) return loginRedirect(request);
		throw error;
	}
}
async function account(request: Request, env: AuthEnv, s: Settings) {
	const identity = await browser(request, env);
	if (identity instanceof Response) return identity;
	const origin = new URL(request.url).origin;
	const csrf = await signed(s, origin, "account", { session: identity.id });
	const grants = await env.CONTENT.list({
		prefix: `${root}credentials/${await authDigest(identity.email)}/agent/`,
		include: ["customMetadata"],
		limit: 100,
		cursor: new URL(request.url).searchParams.get("cursor") || undefined,
	});
	const agents = grants.objects.filter(
		(o) =>
			o.customMetadata?.kind === "agent" &&
			o.customMetadata.epoch === s.epoch &&
			Number(o.customMetadata.expires) > now(),
	);
	const more = grants.truncated
		? `<p><a href="/admin/auth/account?cursor=${encodeURIComponent(grants.cursor)}">סוכנים נוספים</a></p>`
		: "";
	return page(
		"החשבון שלי",
		`<p>מחוברים בתור <b dir="ltr">${escape(identity.email)}</b></p><h2>סוכנים מורשים</h2><p>כל סוכן מורשה לקרוא ולפרסם תוכן. אפשר לבטל את ההרשאה בכל עת.</p>${agents.map((o) => `<article><b>סוכן יצירת תוכן</b><small>בתוקף עד ${escape(new Date(Number(o.customMetadata!.expires) * 1000).toISOString().slice(0, 10))}</small><form method="post" action="/admin/auth/revoke"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="id" value="${escape(o.key.split("/").at(-1)!)}"><button>ביטול הרשאה</button></form></article>`).join("") || "<p>אין סוכנים מורשים בעמוד זה.</p>"}${more}<form method="post" action="/admin/auth/logout"><input type="hidden" name="csrf" value="${escape(csrf)}"><button>יציאה מהאדמין</button></form><p><a href="/admin/">חזרה לאדמין</a></p>`,
	);
}
export async function adminAuthRoutes(request: Request, env: AuthEnv): Promise<Response | null> {
	if (!ssoEnabled(env)) return null;
	const url = new URL(request.url),
		path = url.pathname,
		origin = url.origin;
	if (!path.startsWith("/admin/auth/")) return null;
	try {
		const s = await settings(env);
		if (path === "/admin/auth/login" && request.method === "GET") {
			const next = nextPath(url.searchParams.get("next"), origin);
			return page(
				"כניסה לניהול הספרייה",
				`<p>התחברו עם החשבון המורשה שלכם כדי לנהל תוכן ולהוריד את כלי היצירה.</p><form method="post" action="/admin/auth/start"><input type="hidden" name="next" value="${escape(next)}"><button>כניסה באמצעות ${escape(s.label)}</button></form>`,
			);
		}
		if (path === "/admin/auth/start" && request.method === "POST") {
			sameOrigin(request);
			const values = await input(request, "form");
			const state = random();
			const next = nextPath(values.next, origin);
			const flow = await signed(s, origin, "login", { state, next });
			const callback = new URL("/admin/auth/callback", origin);
			callback.searchParams.set("state", state);
			const target = new URL(s.url);
			target.searchParams.set("url", callback.href);
			return redirect(target.href, [cookie(loginCookie, flow, 600)]);
		}
		if (path === "/admin/auth/callback" && request.method === "GET") {
			const flow = readCookie(request, loginCookie);
			const tx = await transaction(s, origin, flow, "login");
			if (
				url.searchParams.getAll("state").length !== 1 ||
				tx.state !== url.searchParams.get("state") ||
				url.searchParams.getAll("jwt").length !== 1
			)
				fail("בקשת ההתחברות אינה תואמת לדפדפן.", 400);
			const token = url.searchParams.get("jwt")!;
			const identity = await verifySsoIdentity(token, env);
			await consume(env, "used/" + (await authDigest(token)), { expires: now() + 60 });
			await consume(env, "flows/" + (await authDigest(flow!)), { expires: now() + 600 });
			const issued = await issue(env, s, identity, "browser");
			return redirect(nextPath(tx.next, origin), [
				cookie(sessionCookie, issued.token, issued.ttl),
				cookie(loginCookie, "", 0),
			]);
		}
		if (path === "/admin/auth/session" && request.method === "GET") {
			const identity = await authenticateSiteAdmin(request, env);
			return json({ email: identity.email, kind: identity.kind, expires: identity.expires });
		}
		if (path === "/admin/auth/account" && request.method === "GET")
			return await account(request, env, s);
		if (
			["/admin/auth/logout", "/admin/auth/revoke"].includes(path) &&
			request.method === "POST"
		) {
			sameOrigin(request);
			const identity = await authenticateSiteAdmin(request, env, true);
			const values = await input(request, "form");
			const csrf = await transaction(s, origin, values.csrf, "account");
			if (csrf.session !== identity.id) fail("בקשת החשבון אינה תקינה.", 403);
			if (path.endsWith("/logout")) {
				await env.CONTENT.delete(identity.key);
				return redirect("/admin/auth/login", [cookie(sessionCookie, "", 0)]);
			}
			if (typeof values.id !== "string" || !/^[a-f0-9]{64}$/.test(values.id))
				fail("הרשאה אינה תקינה.", 400);
			const key = `${root}credentials/${await authDigest(identity.email)}/agent/${values.id}`;
			const record = await env.CONTENT.get(key);
			if (!record || (await record.json<Credential>()).kind !== "agent")
				fail("ההרשאה לא נמצאה.", 404);
			await env.CONTENT.delete(key);
			return redirect("/admin/auth/account");
		}
		if (path === "/admin/auth/agent/authorize" && request.method === "GET") {
			const details = pairing(url);
			const identity = await browser(request, env);
			if (identity instanceof Response) return identity;
			const csrf = await signed(s, origin, "approve", { ...details, session: identity.id });
			return page(
				"חיבור סוכן ה־AI",
				`<p>סוכן יצירת התוכן במחשב מבקש הרשאה בשם <b dir="ltr">${escape(identity.email)}</b>.</p><p>האישור מאפשר קריאת הקטלוג, הורדת מקורות וסקילים ופרסום תוכן. ההרשאה תקפה ל־30 יום ואפשר לבטל אותה דרך ״החשבון שלי״.</p><form method="post" action="/admin/auth/agent/approve"><input type="hidden" name="csrf" value="${escape(csrf)}"><button>אישור פרסום לסוכן</button></form><p><a href="/admin/">ביטול וחזרה לאדמין</a></p>`,
			);
		}
		if (path === "/admin/auth/agent/approve" && request.method === "POST") {
			sameOrigin(request);
			const identity = await authenticateSiteAdmin(request, env, true);
			const values = await input(request, "form");
			const tx = await transaction(s, origin, values.csrf, "approve");
			if (
				tx.session !== identity.id ||
				typeof tx.uri !== "string" ||
				typeof tx.challenge !== "string" ||
				typeof tx.state !== "string"
			)
				fail("בקשת החיבור אינה תקינה.", 403);
			await consume(env, "approvals/" + (await authDigest(String(values.csrf))), {
				expires: now() + 600,
			});
			const code = random();
			await consume(env, "codes/" + (await authDigest(code)), {
				email: identity.email,
				uid: identity.uid,
				expires: now() + 60,
				epoch: s.epoch,
				uri: tx.uri,
				challenge: tx.challenge,
				used: false,
			});
			const local = new URL(tx.uri);
			local.searchParams.set("code", code);
			local.searchParams.set("state", tx.state);
			return redirect(local.href);
		}
		if (path === "/admin/auth/agent/token" && request.method === "POST") {
			if (request.headers.has("Origin")) sameOrigin(request);
			const values = await input(request, "json");
			if (
				typeof values.code !== "string" ||
				!/^[A-Za-z0-9_-]{43}$/.test(values.code) ||
				typeof values.code_verifier !== "string" ||
				!/^[A-Za-z0-9_-]{43,128}$/.test(values.code_verifier)
			)
				fail("בקשת חיבור אינה תקינה.", 400);
			const key = root + "codes/" + (await authDigest(values.code));
			const record = await env.CONTENT.get(key);
			if (!record) fail("קוד החיבור אינו תקף.", 400);
			const data = await record.json<
				Identity & {
					expires: number;
					epoch: string;
					uri: string;
					challenge: string;
					used: boolean;
				}
			>();
			if (
				data.used ||
				data.expires <= now() ||
				data.epoch !== s.epoch ||
				!s.emails.includes(data.email) ||
				values.redirect_uri !== data.uri ||
				(await pkceChallenge(values.code_verifier)) !== data.challenge
			)
				fail("קוד החיבור אינו תקף.", 400);
			const consumed = await env.CONTENT.put(key, JSON.stringify({ ...data, used: true }), {
				onlyIf: { etagMatches: record.etag },
			});
			if (!consumed) fail("קוד החיבור כבר נוצל.", 400);
			const issued = await issue(env, s, { email: data.email, uid: data.uid }, "agent");
			return json({
				access_token: issued.token,
				token_type: "Bearer",
				expires_at: issued.record.expires,
				scope: "creator",
				email: data.email,
			});
		}
		if (path === "/admin/auth/agent/logout" && request.method === "POST") {
			sameOrigin(request);
			const identity = await authenticateSiteAdmin(request, env);
			if (identity.kind !== "agent") fail("נדרשת הרשאת סוכן.", 403);
			await env.CONTENT.delete(identity.key);
			return json({ disconnected: true });
		}
		return json({ error: "הפעולה אינה נתמכת." }, 404);
	} catch (error) {
		const status = error instanceof CatalogError ? error.status : 500;
		const message =
			error instanceof CatalogError ? error.message : "ההתחברות לא הושלמה. נסו שוב.";
		if (
			["/admin/auth/session", "/admin/auth/agent/token", "/admin/auth/agent/logout"].includes(
				path,
			)
		)
			return json({ error: message }, status);
		const response = page(
			"ההתחברות לא הושלמה",
			`<p>${escape(message)}</p><a class="button" href="/admin/auth/login">כניסה מחדש</a>`,
			status,
		);
		if (path === "/admin/auth/callback") {
			response.headers.append("Set-Cookie", cookie(loginCookie, "", 0));
			response.headers.set("Referrer-Policy", "no-referrer");
		}
		return response;
	}
}
