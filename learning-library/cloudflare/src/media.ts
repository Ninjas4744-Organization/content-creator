import type { Env } from "./model";

function interval(value: string, size: number): [number, number] | false | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
	if (!match || (!match[1] && !match[2])) return null;
	const first = Number(match[1]),
		last = Number(match[2]);
	if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
	if (!match[1]) return last > 0 && size > 0 ? [Math.max(0, size - last), size - 1] : false;
	if (first >= size || (match[2] && last < first)) return false;
	return [first, match[2] ? Math.min(last, size - 1) : size - 1];
}

/** Serve the public catalog and published packages, without exposing other bucket keys. */
export async function content(request: Request, env: Env): Promise<Response | null> {
	const path = new URL(request.url).pathname;
	if (!path.startsWith("/library/") || path.startsWith("/library/brand/")) return null;
	if (!["GET", "HEAD"].includes(request.method))
		return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
	let key: string;
	try {
		key = decodeURIComponent(path.slice(1));
	} catch {
		return new Response(null, { status: 400 });
	}
	const catalog = key === "library/catalog.json";
	const published =
		/^library\/(?:releases\/[a-f0-9]{32}\/)?(?:media|exports)\/[a-zA-Z0-9_./-]+\.(?:html|css|js|jpg|jpeg|png|webp|svg|ttf|woff2?|vtt|mp4|txt|pptx|zip)$/.test(
			key,
		);
	if (
		(!catalog && !published) ||
		key
			.split("/")
			.some((part) => !part || part === "." || part === ".." || part.startsWith("."))
	)
		return new Response(null, { status: 404 });
	const object = await env.CONTENT.head(key);
	if (!object && /^library\/(?:media|exports)\//.test(key)) {
		// Preserve media bookmarks from the previous static deployment.
		const index = await env.CONTENT.get("library/catalog.json");
		if (index) {
			const items = await index.json<{ id: string; poster: string }[]>();
			const item = items.find((entry) => entry.id === key.split("/")[2]);
			const release = item?.poster?.match(/^library\/releases\/[a-f0-9]{32}\//)?.[0];
			if (release)
				return new Response(null, {
					status: 307,
					headers: {
						Location: "/" + release + key.slice("library/".length),
						"Cache-Control": "public, max-age=60",
					},
				});
		}
	}
	if (!object)
		return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("ETag", object.httpEtag);
	headers.set("Last-Modified", object.uploaded.toUTCString());
	headers.set("Accept-Ranges", "bytes");
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "no-referrer");
	headers.set("Content-Security-Policy", "frame-ancestors 'self'; base-uri 'self'");
	headers.set(
		"Cache-Control",
		catalog
			? "no-cache"
			: key.startsWith("library/releases/")
				? "public, max-age=31536000, immutable"
				: "public, max-age=60",
	);
	const etags = request.headers.get("If-None-Match");
	const modified = request.headers.get("If-Modified-Since");
	if (
		etags
			? etags
					.split(",")
					.some(
						(tag) =>
							tag.trim() === "*" ||
							tag.trim().replace(/^W\//, "") === object.httpEtag,
					)
			: modified && object.uploaded.getTime() < Date.parse(modified) + 1000
	)
		return new Response(null, { status: 304, headers });
	headers.set("Content-Length", String(object.size));
	if (request.method === "HEAD") return new Response(null, { headers });
	const range = request.headers.get("Range");
	const validator = request.headers.get("If-Range");
	const matches =
		!validator ||
		validator === object.httpEtag ||
		(!validator.includes('"') && object.uploaded.getTime() < Date.parse(validator) + 1000);
	const part = range && matches ? interval(range, object.size) : null;
	if (part === false) {
		headers.set("Content-Range", `bytes */${object.size}`);
		headers.set("Content-Length", "0");
		return new Response(null, { status: 416, headers });
	}
	const body = await env.CONTENT.get(key, {
		onlyIf: { etagMatches: object.etag },
		...(part ? { range: { offset: part[0], length: part[1] - part[0] + 1 } } : {}),
	});
	// An update between HEAD and GET must not mix old headers with new bytes.
	if (!body || !("body" in body))
		return new Response(null, {
			status: 503,
			headers: { "Cache-Control": "no-store", "Retry-After": "1" },
		});
	if (part) {
		headers.set("Content-Range", `bytes ${part[0]}-${part[1]}/${object.size}`);
		headers.set("Content-Length", String(part[1] - part[0] + 1));
	}
	return new Response(body.body, { status: part ? 206 : 200, headers });
}
