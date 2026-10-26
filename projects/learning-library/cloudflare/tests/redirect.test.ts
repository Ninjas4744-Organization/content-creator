import { expect, test } from "vitest";
import redirect from "../src/redirect";

const old = "https://learn.davinci4744.com";
const current = "https://knowledge.davinci4744.com";

test("public bookmarks redirect permanently with their lesson and media paths", () => {
	for (const path of [
		"/",
		"/?item=community&view=video",
		"/library/media/community/presentation.html",
	]) {
		for (const method of ["GET", "HEAD"]) {
			const response = redirect.fetch(new Request(old + path, { method }));
			expect(response.status).toBe(301);
			expect(response.headers.get("Location")).toBe(current + path);
		}
	}
});

test("stale browser-bound session references are removed from public redirects", () => {
	const response = redirect.fetch(
		new Request(old + "/?item=community&view=video&lti=stale-session"),
	);
	expect(response.headers.get("Location")).toBe(current + "/?item=community&view=video");
});

test("retired LTI endpoints and POST bodies never redirect to the active service", async () => {
	for (const path of [
		"/lti/login",
		"/lti/launch",
		"/lti/jwks",
		"/lti/session",
		"/lti/complete",
		"/health",
	]) {
		for (const method of ["GET", "HEAD", "POST"]) {
			const response = redirect.fetch(
				new Request(old + path, {
					method,
					...(method === "POST" ? { body: "id_token=never-forward-this" } : {}),
				}),
			);
			expect(response.status).toBe(410);
			expect(response.headers.has("Location")).toBe(false);
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			expect(await response.text()).not.toContain("never-forward-this");
		}
	}
	expect(redirect.fetch(new Request(old + "/", { method: "POST", body: "private" })).status).toBe(
		410,
	);
});

test("redirect destinations stay on the primary host", () => {
	const response = redirect.fetch(new Request(old + "//untrusted.example/path"));
	expect(new URL(response.headers.get("Location")!).origin).toBe(current);
	expect(redirect.fetch(new Request("https://untrusted.example/")).status).toBe(404);
});
