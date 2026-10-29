import { content } from "./media";
import type { Env } from "./model";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const path = new URL(request.url).pathname;
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
				return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
			return new Response(
				request.method === "HEAD" ? null : JSON.stringify({ status: "ok" }),
				{
					headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
				},
			);
		}
		return (await content(request, env)) || env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
