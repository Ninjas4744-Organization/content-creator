import mediaData from "../../output/cloudflare-data/media.json";
import type { Env } from "./model";

const media = mediaData as Record<string, number>;

function interval(value: string, size: number): [number, number] | false | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
	// Ignore unsupported units, malformed values and multipart ranges.
	if (!match || (!match[1] && !match[2])) return null;
	const first = Number(match[1]),
		last = Number(match[2]);
	if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
	if (!match[1]) return last > 0 ? [Math.max(0, size - last), size - 1] : false;
	if (first >= size || (match[2] && last < first)) return false;
	return [first, match[2] ? Math.min(last, size - 1) : size - 1];
}

/** Slice the asset stream without buffering a whole video in the isolate. */
function slice(source: ReadableStream<Uint8Array>, start: number, end: number) {
	const reader = source.getReader();
	let offset = 0;
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) {
						controller.close();
						return;
					}
					const from = Math.max(0, start - offset);
					const to = Math.min(value.byteLength, end + 1 - offset);
					offset += value.byteLength;
					if (to > from) controller.enqueue(value.subarray(from, to));
					if (offset > end) {
						controller.close();
						await reader.cancel();
						return;
					}
					if (to > from) return;
				}
			} catch (error) {
				controller.error(error);
				await reader.cancel();
			}
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});
}

export async function video(request: Request, env: Pick<Env, "ASSETS">): Promise<Response | null> {
	const path = new URL(request.url).pathname;
	const size = Object.hasOwn(media, path) ? media[path] : undefined;
	if (!size || !["GET", "HEAD"].includes(request.method)) return null;
	const sourceRequest = new Request(request);
	sourceRequest.headers.delete("Range");
	sourceRequest.headers.delete("If-Range");
	const asset = await env.ASSETS.fetch(sourceRequest);
	if (asset.status !== 200) return asset;
	const headers = new Headers(asset.headers);
	headers.set("Accept-Ranges", "bytes");
	headers.set("Content-Length", String(size));
	if (request.method === "HEAD") return new Response(null, { status: 200, headers });
	const range = request.headers.get("Range");
	const validator = request.headers.get("If-Range");
	const matches =
		!validator || (!validator.startsWith("W/") && validator === headers.get("ETag"));
	const part = range && matches ? interval(range, size) : null;
	if (part === null) return new Response(asset.body, { status: 200, headers });
	if (part === false) {
		await asset.body?.cancel();
		headers.set("Content-Range", `bytes */${size}`);
		headers.set("Content-Length", "0");
		return new Response(null, { status: 416, headers });
	}
	const [start, end] = part;
	headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
	headers.set("Content-Length", String(end - start + 1));
	return new Response(slice(asset.body!, start, end), { status: 206, headers });
}
