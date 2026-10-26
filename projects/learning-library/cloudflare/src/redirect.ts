const destination = "https://knowledge.davinci4744.com";

/** The retired hostname has no assets, database binding, or LTI signing keys. */
export default {
	fetch(request: Request): Response {
		const url = new URL(request.url);
		if (url.origin !== "https://learn.davinci4744.com")
			return new Response("Not found", { status: 404 });
		if (
			!["GET", "HEAD"].includes(request.method) ||
			url.pathname.startsWith("/lti/") ||
			url.pathname === "/health"
		)
			return new Response(
				request.method === "HEAD"
					? null
					: `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>ספריית הלמידה עברה כתובת</title><p>כתובת זו אינה פעילה עוד. פתחו את השיעור מחדש מתוך הקורס או עברו אל <a href="${destination}/">ספריית הלמידה</a>.</p></html>`,
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
		// Browser-bound LTI references cannot be transferred to another origin.
		target.searchParams.delete("lti");
		return Response.redirect(target.href, 301);
	},
} satisfies ExportedHandler;
