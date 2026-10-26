import { SELF } from "cloudflare:test";
import { expect, test, vi } from "vitest";
import mediaData from "../../output/cloudflare-data/media.json";
import { video } from "../src/media";

const [path, size] = Object.entries(mediaData)[0]!;
const pattern = Uint8Array.from({ length: 251 * 4096 }, (_, index) => index % 251);

function source(status = 200, closeAtEnd = true) {
	const cancelled = vi.fn();
	const fetch = vi.fn(async (request: Request) => {
		expect(request.headers.has("Range")).toBe(false);
		expect(request.headers.has("If-Range")).toBe(false);
		let remaining = size;
		return new Response(
			status === 200
				? new ReadableStream({
						pull(controller) {
							if (!remaining) return;
							const chunk = pattern.subarray(0, Math.min(remaining, pattern.length));
							remaining -= chunk.length;
							controller.enqueue(chunk);
							if (closeAtEnd && !remaining) controller.close();
						},
						cancel: cancelled,
					})
				: null,
			{ status, headers: { ETag: '"revision"', "Content-Type": "video/mp4" } },
		);
	});
	return { env: { ASSETS: { fetch } as unknown as Fetcher }, cancelled };
}

test.each([{ closeAtEnd: true }, { closeAtEnd: false }])(
	"streams exact prefix, interior, open-ended and suffix ranges (closeAtEnd=$closeAtEnd)",
	async ({ closeAtEnd }) => {
		for (const [range, start, end] of [
			["bytes=0-1", 0, 1],
			["bytes=1028093-1028100", 1028093, 1028100],
			[`bytes=${size - 3}-`, size - 3, size - 1],
			["bytes=-7", size - 7, size - 1],
		] as const) {
			const { env, cancelled } = source(200, closeAtEnd);
			const response = (await video(
				new Request("https://library.example" + path, { headers: { Range: range } }),
				env,
			))!;
			expect(response.status).toBe(206);
			expect(response.headers.get("Content-Range")).toBe(`bytes ${start}-${end}/${size}`);
			expect(response.headers.get("Content-Length")).toBe(String(end - start + 1));
			expect([...new Uint8Array(await response.arrayBuffer())]).toEqual(
				Array.from({ length: end - start + 1 }, (_, index) => (start + index) % 251),
			);
			// Cancelling an already-closed stream does not call the source's cancel hook.
			const cancellations = closeAtEnd && end === size - 1 ? 0 : 1;
			expect(cancelled, range).toHaveBeenCalledTimes(cancellations);
		}
	},
);

test("rejects unsatisfiable ranges and ignores unsupported syntax", async () => {
	for (const range of ["bytes=-0", `bytes=${size}-`, "bytes=8-3"]) {
		const response = (await video(
			new Request("https://library.example" + path, { headers: { Range: range } }),
			source().env,
		))!;
		expect(response.status).toBe(416);
		expect(response.headers.get("Content-Range")).toBe(`bytes */${size}`);
		expect(await response.text()).toBe("");
	}
	for (const range of [
		"items=1-2",
		"bytes=1-2,4-5",
		"bytes=garbage",
		"bytes=-",
		"bytes=999999999999999999999-",
	]) {
		const response = (await video(
			new Request("https://library.example" + path, { headers: { Range: range } }),
			source().env,
		))!;
		expect(response.status).toBe(200);
		await response.body?.cancel();
	}
});

test("preserves conditional requests, HEAD and If-Range validators", async () => {
	const head = (await video(
		new Request("https://library.example" + path, { method: "HEAD" }),
		source().env,
	))!;
	expect(head.headers.get("Content-Length")).toBe(String(size));
	expect(head.headers.get("Accept-Ranges")).toBe("bytes");
	expect(await head.text()).toBe("");
	for (const validator of ['"revision"', '"old"', 'W/"revision"']) {
		const response = (await video(
			new Request("https://library.example" + path, {
				headers: { Range: "bytes=0-1", "If-Range": validator },
			}),
			source().env,
		))!;
		expect(response.status).toBe(validator === '"revision"' ? 206 : 200);
		await response.body?.cancel();
	}
	const unchanged = (await video(
		new Request("https://library.example" + path, {
			headers: { Range: "bytes=0-1", "If-None-Match": '"revision"' },
		}),
		source(304).env,
	))!;
	expect(unchanged.status).toBe(304);
});

test("the configured public MP4 route runs the range handler", async () => {
	const response = await SELF.fetch("https://knowledge.davinci4744.com" + path, {
		headers: { Range: "bytes=0-1" },
	});
	expect(response.status).toBe(206);
	expect(response.headers.get("Content-Type")).toBe("video/mp4");
	expect((await response.arrayBuffer()).byteLength).toBe(2);
});
