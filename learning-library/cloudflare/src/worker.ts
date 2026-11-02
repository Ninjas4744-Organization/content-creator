import { parseCatalog } from "../../src/core/catalogDocument";
import { resolveGallery } from "../../src/core/galleryRouting";
import { admin } from "./admin";
import { content } from "./media";
import type { Env } from "./model";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const path = new URL(request.url).pathname;
		if (path === "/admin" || path.startsWith("/admin/")) return admin(request, env);
		if (path === "/lti" || path.startsWith("/lti/"))
			return new Response(
				request.method === "HEAD"
					? null
					: "חיבור LTI אינו זמין עוד. לשילוב בקורס, הורידו חבילת SCORM מהספרייה.",
				{
					status: 410,
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
						"Cache-Control": "no-store",
						"X-Content-Type-Options": "nosniff",
					},
				},
			);
		if (path === "/health") {
			if (!["GET", "HEAD"].includes(request.method))
				return new Response(null, {
					status: 405,
					headers: { Allow: "GET, HEAD" },
				});
			return new Response(
				request.method === "HEAD" ? null : JSON.stringify({ status: "ok" }),
				{
					headers: {
						"Content-Type": "application/json",
						"Cache-Control": "no-store",
					},
				},
			);
		}
		const media = await content(request, env);
		if (media) return media;
		if (
			["GET", "HEAD"].includes(request.method) &&
			!path.startsWith("/library/") &&
			!path.startsWith("/_expo/") &&
			!path.startsWith("/project-sources/")
		) {
			const index = await env.CONTENT.get("library/catalog.json");
			if (index) {
				try {
					const catalog = parseCatalog(await index.json());
					if (resolveGallery(catalog.galleries, request.url)) {
						const target = new URL("/", request.url);
						return env.ASSETS.fetch(new Request(target, request));
					}
				} catch {
					/* Invalid catalogs never turn unknown paths into valid library routes. */
				}
			}
		}
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
