import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { CatalogError } from "../../admin/server/catalog-domain.mjs";
import type { Env } from "./model";
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function accessSettings(env: Env) {
	const issuer = env.ADMIN_ACCESS_ISSUER?.replace(/\/$/, "");
	const audience = env.ADMIN_ACCESS_AUD;
	const emails = (env.ADMIN_EMAILS || "")
		.split(",")
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);
	if (
		!issuer ||
		!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) ||
		!audience ||
		!emails.length
	)
		throw new CatalogError("הכניסה לניהול עדיין אינה מוגדרת.", 503);
	return { issuer, audience, emails };
}
export async function verifyAdminToken(token: string, env: Env, keys: JWTVerifyGetKey) {
	const { issuer, audience, emails } = accessSettings(env);
	try {
		const { payload } = await jwtVerify(token, keys, {
			issuer,
			audience,
			algorithms: ["RS256"],
			requiredClaims: ["exp", "iat", "sub", "email"],
		});
		if (
			typeof payload.email !== "string" ||
			!emails.includes(payload.email.toLowerCase()) ||
			!payload.sub
		)
			throw new Error("Not authorized");
		return payload.email.toLowerCase();
	} catch {
		throw new CatalogError("אין הרשאה לניהול הספרייה.", 403);
	}
}
export async function authenticateAdmin(request: Request, env: Env): Promise<string> {
	const { issuer } = accessSettings(env);
	const token = request.headers.get("Cf-Access-Jwt-Assertion");
	if (!token) throw new CatalogError("יש להתחבר כדי לנהל את הספרייה.", 401);
	let keys = keySets.get(issuer);
	if (!keys) {
		keys = createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs"));
		keySets.set(issuer, keys);
	}
	return verifyAdminToken(token, env, keys);
}
