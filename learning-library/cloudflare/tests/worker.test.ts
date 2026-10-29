import { env, SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Env } from "../src/model";
const bucket = (env as unknown as Env).CONTENT;

const origin = "https://knowledge.davinci4744.com";

test("health works without an LMS registration, signing keys or database", async () => {
	const response = await SELF.fetch(origin + "/health");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ status: "ok" });
	const head = await SELF.fetch(origin + "/health", { method: "HEAD" });
	expect(head.status).toBe(200);
	expect(await head.text()).toBe("");
	expect((await SELF.fetch(origin + "/health", { method: "POST" })).status).toBe(405);
});

test("retired integration routes never accept or redirect launches", async () => {
	for (const path of [
		"/lti",
		"/lti/resource",
		"/lti/login",
		"/lti/launch",
		"/lti/jwks",
		"/lti/exchange",
		"/lti/session",
		"/lti/select",
		"/lti/progress",
		"/lti/answer",
		"/lti/complete",
	]) {
		for (const method of ["GET", "HEAD", "POST"]) {
			const response = await SELF.fetch(origin + path, {
				method,
				...(method === "POST" ? { body: "id_token=never-forward-this" } : {}),
			});
			expect(response.status).toBe(410);
			expect(response.headers.has("Location")).toBe(false);
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			const body = await response.text();
			expect(body).not.toContain("never-forward-this");
			if (method === "HEAD") expect(body).toBe("");
			else expect(body).toContain("SCORM");
		}
	}
});

test("catalog and lesson packages come from R2 and update without a website build", async () => {
	const home = await SELF.fetch(origin + "/");
	expect(home.status).toBe(200);
	await home.text();
	const item = {
		id: "demo",
		title: "First",
		chapters: ["Opening"],
		deck: "library/media/demo/presentation.html",
		video: "library/media/demo/interactive/index.html",
		scorm: { deck: "library/exports/demo/slides.zip", video: "library/exports/demo/video.zip" },
	};
	await bucket.put("library/catalog.json", JSON.stringify([item]), {
		httpMetadata: { contentType: "application/json" },
	});
	await bucket.put(item.deck, "<html>Lesson</html>", {
		httpMetadata: { contentType: "text/html" },
	});
	await bucket.put(item.video, "<video src='video.mp4'></video>", {
		httpMetadata: { contentType: "text/html" },
	});
	for (const key of Object.values(item.scorm))
		await bucket.put(key, new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
			httpMetadata: { contentType: "application/zip" },
		});
	const response = await SELF.fetch(origin + "/library/catalog.json");
	expect(await response.json()).toEqual([item]);
	expect(response.headers.get("Cache-Control")).toBe("no-cache");
	for (const key of [item.deck, item.video, ...Object.values(item.scorm)]) {
		const asset = await SELF.fetch(origin + "/" + key);
		expect(asset.status).toBe(200);
		await asset.arrayBuffer();
	}
	const changed = { ...item, title: "Updated without deployment" };
	await bucket.put("library/catalog.json", JSON.stringify([changed]));
	expect(await (await SELF.fetch(origin + "/library/catalog.json")).json()).toEqual([changed]);
});

test("old static media bookmarks redirect to the current immutable R2 release", async () => {
	const release = "library/releases/0123456789abcdef0123456789abcdef/";
	await bucket.put(
		"library/catalog.json",
		JSON.stringify([{ id: "legacy", poster: release + "media/legacy/poster.jpg" }]),
	);
	for (const key of ["media/legacy/interactive/index.html", "exports/legacy/video.zip"]) {
		const response = await SELF.fetch(origin + "/library/" + key, { redirect: "manual" });
		expect(response.status).toBe(307);
		expect(response.headers.get("Location")).toBe("/" + release + key);
	}
});
