import assert from "node:assert/strict";
import { test } from "node:test";
import { LtiClient } from "../src/features/lti/LtiClient";

test("the browser fetch API is called with its native receiver", async () => {
	const original = globalThis.fetch;
	globalThis.fetch = async function (this: unknown) {
		assert.equal(this, undefined);
		return new Response(JSON.stringify({ mode: "select" }));
	};
	try {
		assert.deepEqual(await new LtiClient("session").load(), { mode: "select" });
	} finally {
		globalThis.fetch = original;
	}
});

test("progress and answers finish before completion, and bearer tokens stay out of URLs", async () => {
	const requests: { url: string; body: unknown; authorization: string }[] = [];
	const transport = (async (url, init) => {
		requests.push({
			url: String(url),
			body: init?.body ? JSON.parse(String(init.body)) : null,
			authorization: (init?.headers as Record<string, string>).Authorization!,
		});
		await new Promise((resolve) => setTimeout(resolve, 5));
		return new Response(JSON.stringify({ ready: true }), { status: 200 });
	}) as typeof fetch;
	const client = new LtiClient("browser-session-secret", transport);
	await Promise.all([
		client.progress({ event: "slide", index: 0 }),
		client.answer("quiz", 1),
		client.complete(),
	]);
	assert.deepEqual(
		requests.map((request) => request.url),
		["/lti/progress", "/lti/answer", "/lti/complete"],
	);
	assert.ok(
		requests.every((request) => request.authorization === "Bearer browser-session-secret"),
	);
	assert.deepEqual(requests[1]!.body, { question: "quiz", option: 1 });
});

test("a failed report does not poison the queue or prevent retry", async () => {
	let calls = 0;
	const client = new LtiClient("session", (async () => {
		calls++;
		return new Response(
			JSON.stringify(calls === 1 ? { message: "retry" } : { reported: true }),
			{ status: calls === 1 ? 502 : 200 },
		);
	}) as typeof fetch);
	await assert.rejects(client.complete(), /retry/);
	assert.equal((await client.complete()).reported, true);
});
