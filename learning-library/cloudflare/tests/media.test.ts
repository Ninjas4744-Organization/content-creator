import { env, SELF } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
import type { Env } from "../src/model";

const bucket = (env as unknown as Env).CONTENT;
const path = "/library/releases/0123456789abcdef0123456789abcdef/media/demo/interactive/video.mp4";
const bytes = Uint8Array.from({ length: 64 * 1024 + 13 }, (_, index) => index % 251);
const origin = "https://knowledge.davinci4744.com";

beforeEach(async () => {
	await bucket.put(path.slice(1), bytes, { httpMetadata: { contentType: "video/mp4" } });
});

test("streams prefix, interior, open-ended and suffix ranges directly from R2", async () => {
	for (const [range, start, end] of [
		["bytes=0-1", 0, 1],
		["bytes=32765-32772", 32765, 32772],
		[`bytes=${bytes.length - 3}-`, bytes.length - 3, bytes.length - 1],
		["bytes=-7", bytes.length - 7, bytes.length - 1],
	] as const) {
		const response = await SELF.fetch(origin + path, { headers: { Range: range } });
		expect(response.status).toBe(206);
		expect(response.headers.get("Content-Range")).toBe(`bytes ${start}-${end}/${bytes.length}`);
		expect(response.headers.get("Content-Length")).toBe(String(end - start + 1));
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes.slice(start, end + 1));
	}
});

test("rejects unsatisfiable ranges and ignores unsupported syntax", async () => {
	for (const range of ["bytes=-0", `bytes=${bytes.length}-`, "bytes=8-3"]) {
		const response = await SELF.fetch(origin + path, { headers: { Range: range } });
		expect(response.status).toBe(416);
		expect(response.headers.get("Content-Range")).toBe(`bytes */${bytes.length}`);
		expect((await response.arrayBuffer()).byteLength).toBe(0);
	}
	for (const range of [
		"items=1-2",
		"bytes=1-2,4-5",
		"bytes=garbage",
		"bytes=-",
		"bytes=999999999999999999999-",
	]) {
		const response = await SELF.fetch(origin + path, { headers: { Range: range } });
		expect(response.status).toBe(200);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
	}
});

test("preserves HEAD, conditional requests and If-Range validators", async () => {
	const head = await SELF.fetch(origin + path, { method: "HEAD" });
	expect(head.headers.get("Content-Length")).toBe(String(bytes.length));
	expect(head.headers.get("Content-Type")).toBe("video/mp4");
	expect((await head.arrayBuffer()).byteLength).toBe(0);
	const etag = head.headers.get("ETag")!;
	for (const validator of [etag, '"old"', `W/${etag}`]) {
		const response = await SELF.fetch(origin + path, {
			headers: { Range: "bytes=0-1", "If-Range": validator },
		});
		expect(response.status).toBe(validator === etag ? 206 : 200);
		await response.arrayBuffer();
	}
	const unchanged = await SELF.fetch(origin + path, { headers: { "If-None-Match": etag } });
	expect(unchanged.status).toBe(304);
	expect(await unchanged.text()).toBe("");
});

test("does not expose private keys, missing files or mutation methods", async () => {
	await bucket.put("private/config.json", "private");
	for (const denied of [
		"/library/private/config.json",
		"/library/media/demo/.env",
		"/library/media/demo/missing.mp4",
	]) {
		const response = await SELF.fetch(origin + denied);
		expect(response.status).toBe(404);
		await response.text();
	}
	expect((await SELF.fetch(origin + path, { method: "PUT", body: "replace" })).status).toBe(405);
});
