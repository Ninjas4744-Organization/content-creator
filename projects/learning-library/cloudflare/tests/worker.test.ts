import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";
import media from "../../output/cloudflare-data/media.json";

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

test("public lessons and both SCORM formats remain available as static assets", async () => {
	const home = await SELF.fetch(origin + "/");
	expect(home.status).toBe(200);
	const catalog = (await (await SELF.fetch(origin + "/library/catalog.json")).json()) as {
		deck: string;
		video: string | null;
		scorm: { deck: string; video?: string };
	}[];
	expect(catalog.length).toBeGreaterThan(0);
	const item = catalog.find((entry) => entry.video && entry.scorm.video)!;
	expect(item).toBeDefined();
	expect((await SELF.fetch(origin + "/" + item.deck)).status).toBe(200);
	expect((await SELF.fetch(origin + "/" + item.video)).status).toBe(200);
	for (const path of [item.scorm.deck, item.scorm.video!]) {
		const response = await SELF.fetch(origin + "/" + path);
		expect(response.status).toBe(200);
		const bytes = new Uint8Array(await response.arrayBuffer());
		expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
	}
	expect(Object.keys(media).length).toBeGreaterThan(0);
});
