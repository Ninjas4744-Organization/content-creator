import { adminAuthRoutes, authenticateSiteAdmin, loginRedirect, ssoEnabled } from "./admin-sso";
import { creatorApi } from "../../admin/worker/creator";
import { CatalogDomain, CatalogError, documentOf } from "../../admin/server/catalog-domain.mjs";
import { authenticateAdmin } from "./admin-access";
import { R2CatalogStorage } from "./admin-storage";
import type { Env } from "./model";
const headers = {
	"Cache-Control": "no-store",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "no-referrer",
	"X-Frame-Options": "DENY",
};
function json(status: number, value: unknown, extra: Record<string, string> = {}) {
	return Response.json(value, { status, headers: { ...headers, ...extra } });
}
async function body(request: Request): Promise<Record<string, unknown>> {
	if (!request.headers.get("Content-Type")?.startsWith("application/json"))
		throw new CatalogError("נדרש JSON.", 415);
	const reader = request.body?.getReader();
	if (!reader) throw new CatalogError("נדרש JSON תקין.");
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const part = await reader.read();
		if (part.done) break;
		size += part.value.length;
		if (size > 4 * 1024 * 1024) {
			await reader.cancel();
			throw new CatalogError("הקובץ גדול מדי (עד 4MB).", 413);
		}
		chunks.push(part.value);
	}
	const bytes = new Uint8Array(size);
	let position = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, position);
		position += chunk.length;
	}
	try {
		const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
		if (!value || typeof value !== "object" || Array.isArray(value))
			throw new Error("Invalid body");
		return value as Record<string, unknown>;
	} catch {
		throw new CatalogError("נדרש אובייקט JSON תקין.");
	}
}
const snapshot = (state: Awaited<ReturnType<CatalogDomain["read"]>>) => ({
	...documentOf(state),
	revision: state.revision,
	updatedAt: state.updatedAt,
	mode: "production",
});
export async function adminApi(request: Request, env: Env, email: string): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.slice("/admin".length);
	if (
		!["GET", "HEAD"].includes(request.method) &&
		(request.headers.get("Origin") !== url.origin ||
			request.headers.get("Sec-Fetch-Site") === "cross-site")
	)
		throw new CatalogError("מקור הבקשה אינו מורשה.", 403);
	const store = new CatalogDomain(new R2CatalogStorage(env.CONTENT, email));
	if (path.startsWith("/api/creator/"))
		return creatorApi(request, env, email, new R2CatalogStorage(env.CONTENT, email));
	const revision = request.headers.get("If-Match") ?? undefined;
	if (path === "/api/catalog" && request.method === "GET")
		return json(200, snapshot(await store.read()));
	if (path === "/api/catalog" && request.method === "PUT") {
		const input = await body(request);
		return json(200, snapshot(await store.mutate(revision, input.items, input.action)));
	}
	if (path === "/api/galleries" && request.method === "POST")
		return json(200, snapshot(await store.mutateGallery(revision, await body(request))));
	if (path === "/api/import" && request.method === "POST") {
		const input = await body(request);
		return json(200, snapshot(await store.importCatalog(revision, input.catalog, input.mode)));
	}
	if (path === "/api/history" && request.method === "GET")
		return json(200, { history: await store.history() });
	if (path === "/api/restore" && request.method === "POST") {
		const input = await body(request);
		if (typeof input.id !== "string" || !input.id)
			throw new CatalogError("יש לבחור גרסה לשחזור.");
		return json(200, snapshot(await store.mutate(revision, null, undefined, input.id)));
	}
	if (path === "/api/source" && request.method === "GET")
		return json(200, {
			source: url.origin + "/library/catalog.json",
			catalog: documentOf(await store.read()),
		});
	if (path === "/api/export" && request.method === "GET")
		return json(200, documentOf(await store.read()), {
			"Content-Disposition": 'attachment; filename="catalog.json"',
		});
	throw new CatalogError("הפעולה לא נמצאה.", 404);
}
export async function admin(request: Request, env: Env): Promise<Response> {
	try {
		const authResponse = await adminAuthRoutes(request, env);
		if (authResponse) return authResponse;
		let email: string;
		if (ssoEnabled(env)) {
			try {
				email = (await authenticateSiteAdmin(request, env)).email;
			} catch (error) {
				if (
					error instanceof CatalogError &&
					error.status === 401 &&
					["GET", "HEAD"].includes(request.method) &&
					!new URL(request.url).pathname.startsWith("/admin/api/")
				)
					return loginRedirect(request);
				throw error;
			}
		} else email = await authenticateAdmin(request, env);
		const path = new URL(request.url).pathname;
		if (path.startsWith("/admin/api/")) return await adminApi(request, env, email);
		if (!["GET", "HEAD"].includes(request.method))
			throw new CatalogError("הפעולה אינה נתמכת.", 405);
		const result = await env.ASSETS.fetch(request);
		let content: BodyInit | null = result.body;
		const hashes: string[] = [];
		if (
			request.method !== "HEAD" &&
			result.headers.get("Content-Type")?.includes("text/html")
		) {
			const html = await result.text();
			content = html;
			const encoder = new TextEncoder();
			for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
				if (!match[1]?.trim()) continue;
				const digest = new Uint8Array(
					await crypto.subtle.digest("SHA-256", encoder.encode(match[1])),
				);
				hashes.push("'sha256-" + btoa(String.fromCharCode(...digest)) + "'");
			}
		}
		const response = new Response(content, result);
		for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
		response.headers.set(
			"Content-Security-Policy",
			`default-src 'self'; script-src 'self' ${hashes.join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' https://knowledge.davinci4744.com data:; font-src 'self'; connect-src 'self'; frame-src https://knowledge.davinci4744.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`,
		);
		return response;
	} catch (error) {
		return json(error instanceof CatalogError ? error.status : 500, {
			error: error instanceof CatalogError ? error.message : "השמירה לא הושלמה. נסו שוב.",
		});
	}
}
