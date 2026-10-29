const destination = "https://knowledge.davinci4744.com";

/** Keep public bookmarks on the retired hostname working. */
export default {
	fetch(request: Request): Response {
		const url = new URL(request.url);
		if (url.origin !== "https://learn.davinci4744.com")
			return new Response("Not found", { status: 404 });
		if (
			!["GET", "HEAD"].includes(request.method) ||
			url.pathname === "/lti" ||
			url.pathname.startsWith("/lti/") ||
			url.pathname === "/health"
		)
			return new Response(
				request.method === "HEAD"
					? null
					: `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>ספריית הלמידה עברה כתובת</title><p>כתובת זו אינה פעילה עוד. לשילוב בקורס הורידו חבילת SCORM מתוך <a href="${destination}/">ספריית הלמידה</a>.</p></html>`,
				{
					status: 410,
					headers: {
						"Content-Type": "text/html; charset=utf-8",
						"Cache-Control": "no-store",
						"Referrer-Policy": "no-referrer",
						"X-Content-Type-Options": "nosniff",
						"Content-Security-Policy":
							"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
					},
				},
			);
		const target = new URL(destination);
		target.pathname = url.pathname;
		target.search = url.search;
		// Drop retired integration parameters from public bookmarks.
		target.searchParams.delete("lti");
		return Response.redirect(target.href, 301);
	},
} satisfies ExportedHandler;
