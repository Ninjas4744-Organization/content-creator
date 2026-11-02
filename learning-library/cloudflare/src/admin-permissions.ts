import { SignJWT } from "jose";
import { CatalogError } from "../../admin/server/catalog-domain.mjs";

export interface PermissionEnv {
	CONTENT: R2Bucket;
	ADMIN_SSO_AUTHORIZATION?: string;
	ADMIN_PERMISSION_URL?: string;
	ADMIN_PERMISSION_AUTH?: string;
	ADMIN_PERMISSION_USER?: string;
	ADMIN_PERMISSION_SECRET?: string;
	ADMIN_PERMISSION_DOMAIN?: string;
	ADMIN_PERMISSION_KEY?: string;
	ADMIN_PERMISSION_LABEL?: string;
}
export interface PermissionProfile {
	uid: string;
	label: string;
	email?: string;
}
const encode = (value: string) => new TextEncoder().encode(value);
const now = () => Math.floor(Date.now() / 1000);
async function digest(value: string) {
	return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encode(value))))
		.map((n) => n.toString(16).padStart(2, "0"))
		.join("");
}
function unavailable(): never {
	throw new CatalogError("בדיקת ההרשאה במערכת הלמידה אינה זמינה כרגע.", 503);
}
export function remotePermissions(env: PermissionEnv): boolean {
	if (
		env.ADMIN_SSO_AUTHORIZATION &&
		!["email", "remote-field"].includes(env.ADMIN_SSO_AUTHORIZATION)
	)
		unavailable();
	return env.ADMIN_SSO_AUTHORIZATION === "remote-field";
}
export async function permissionSettings(env: PermissionEnv, issuer: string) {
	if (!remotePermissions(env)) return null;
	try {
		const url = new URL(env.ADMIN_PERMISSION_URL || "");
		const auth = env.ADMIN_PERMISSION_AUTH || "basic";
		const user = env.ADMIN_PERMISSION_USER || "";
		const secret = env.ADMIN_PERMISSION_SECRET || "";
		const field = env.ADMIN_PERMISSION_KEY || "";
		const label = env.ADMIN_PERMISSION_LABEL || "";
		const domain = env.ADMIN_PERMISSION_DOMAIN;
		if (
			url.protocol !== "https:" ||
			url.origin !== new URL(issuer).origin ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			!["basic", "jwt"].includes(auth) ||
			!user ||
			!secret ||
			user.includes(":") ||
			!/^[A-Za-z_][A-Za-z0-9_]{0,49}$/.test(field) ||
			!label ||
			label.length > 200 ||
			(domain !== undefined && !/^\d{1,20}$/.test(domain)) ||
			(auth === "jwt" && encode(secret).length < 32)
		)
			throw new Error();
		const fingerprint = await digest(
			JSON.stringify([url.href, auth, user, secret, domain, field, label]),
		);
		return { url, auth, user, secret, field, label, domain, fingerprint };
	} catch {
		return unavailable();
	}
}
const checked = (value: unknown) => value === true || value === 1 || value === "1";
async function responseJson(response: Response): Promise<Record<string, unknown>> {
	if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) {
		await response.body?.cancel();
		unavailable();
	}
	const reader = response.body?.getReader();
	if (!reader) unavailable();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const part = await reader.read();
		if (part.done) break;
		size += part.value.length;
		if (size > 1024 * 1024) {
			await reader.cancel();
			unavailable();
		}
		chunks.push(part.value);
	}
	const data = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		data.set(chunk, offset);
		offset += chunk.length;
	}
	const result: unknown = JSON.parse(new TextDecoder().decode(data));
	if (!result || typeof result !== "object" || Array.isArray(result)) unavailable();
	return result as Record<string, unknown>;
}
/** Read one verified user's permission. Never retain or log the full API profile. */
export async function permissionProfile(
	env: PermissionEnv,
	issuer: string,
	uid: string,
	fresh = false,
): Promise<PermissionProfile> {
	const config = await permissionSettings(env, issuer);
	if (!config || !/^[1-9]\d{0,19}$/.test(uid)) unavailable();
	const cacheKey = `private/admin-auth/permission-cache/${config.fingerprint}/${uid}`;
	if (!fresh) {
		const cache = await env.CONTENT.get(cacheKey);
		if (cache) {
			const value = await cache.json<PermissionProfile & { expires: number }>();
			if (
				value.uid === uid &&
				typeof value.label === "string" &&
				value.expires > now() &&
				value.expires <= now() + 30
			)
				return { uid, label: value.label, ...(value.email ? { email: value.email } : {}) };
		}
	}
	try {
		const authorization =
			config.auth === "jwt"
				? "Bearer " +
					(await new SignJWT({})
						.setProtectedHeader({ alg: "HS256" })
						.setIssuer(config.user)
						.setIssuedAt()
						.setExpirationTime("30s")
						.sign(encode(config.secret)))
				: "Basic " +
					btoa(String.fromCharCode(...encode(config.user + ":" + config.secret)));
		const response = await fetch(config.url, {
			method: "POST",
			headers: {
				Authorization: authorization,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				user_identifier: {
					user_id: uid,
					...(config.domain !== undefined ? { domain: config.domain } : {}),
				},
			}),
			redirect: "manual",
			signal: AbortSignal.timeout(8000),
		});
		const data = await responseJson(response);
		const profile = data.user_details;
		if (
			!profile ||
			typeof profile !== "object" ||
			Array.isArray(profile) ||
			data.res === "error"
		)
			unavailable();
		const user = profile as Record<string, unknown>;
		const keyPresent = Object.hasOwn(user, config.field),
			labelPresent = Object.hasOwn(user, config.label);
		const expiration =
			user.user_expiration === null ||
			user.user_expiration === undefined ||
			user.user_expiration === ""
				? null
				: Number(user.user_expiration);
		if (
			String(user.user_id) !== uid ||
			(config.domain !== undefined && String(user.domain_id) !== config.domain) ||
			!checked(user.user_enabled) ||
			typeof user.user_name !== "string" ||
			!user.user_name ||
			(expiration !== null && (!Number.isFinite(expiration) || expiration <= now())) ||
			(!keyPresent && !labelPresent) ||
			!checked(keyPresent ? user[config.field] : user[config.label]) ||
			(keyPresent &&
				labelPresent &&
				checked(user[config.field]) !== checked(user[config.label]))
		) {
			await env.CONTENT.delete(cacheKey);
			throw new CatalogError("לחשבון זה אין הרשאה לניהול ספריית הידע.", 403);
		}
		const label = [
			user.full_name,
			[user.user_first_name, user.user_last_name]
				.filter((v) => typeof v === "string" && v)
				.join(" "),
			user.user_name,
		].find((v) => typeof v === "string" && v.trim()) as string;
		const email =
			typeof user.user_email === "string" && user.user_email
				? user.user_email.toLowerCase()
				: undefined;
		const result = { uid, label: label.trim().slice(0, 200), ...(email ? { email } : {}) };
		await env.CONTENT.put(
			cacheKey,
			JSON.stringify({ ...result, expires: Math.min(now() + 30, expiration ?? Infinity) }),
			{ httpMetadata: { contentType: "application/json", cacheControl: "no-store" } },
		);
		return result;
	} catch (error) {
		if (error instanceof CatalogError) throw error;
		return unavailable();
	}
}
