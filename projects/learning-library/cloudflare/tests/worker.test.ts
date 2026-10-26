import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, expect, test, vi } from "vitest";
import {
	SignJWT,
	base64url,
	exportJWK,
	exportPKCS8,
	generateKeyPair,
	jwtVerify,
	type CryptoKey,
	type JWTPayload,
} from "jose";
import { XMLParser } from "fast-xml-parser";
import worker from "../src/worker";
import { BO, DL, LTI, SCOPE, digest } from "../src/protocol";
import { Store } from "../src/store";
import type { Env, Attempt, Lesson } from "../src/model";
import lessonData from "../../output/cloudflare-data/lessons.json";

type WorkerBindings = Env;
declare global {
	namespace Cloudflare {
		interface Env extends WorkerBindings {}
	}
}

const tool = "https://library.example",
	issuer = "https://platform.example/lms";
const item = Object.values(lessonData)[0] as Lesson;
let platformKey: CryptoKey, toolKey: CryptoKey;
let bindings: Env;
let platformJwk: Record<string, any>;
let sent: any[] = [];
let failure = false;
let tokenRedirect = false;
let lastAssertion: Record<string, any>;

beforeAll(async () => {
	await applyD1Migrations(env.DB, (env as any).TEST_MIGRATIONS);
	const platform = await generateKeyPair("RS256", { extractable: true });
	const service = await generateKeyPair("RS256", { extractable: true });
	platformKey = platform.privateKey;
	toolKey = service.publicKey;
	platformJwk = {
		...(await exportJWK(platform.publicKey)),
		kid: "platform",
		alg: "RS256",
		use: "sig",
	};
	bindings = {
		...(env as unknown as Env),
		TOOL_URL: tool,
		ALTERNATE_TOOL_URL: "https://old-library.example",
		PLATFORM_ISSUER: issuer,
		PRIVATE_KEY_PEM: await exportPKCS8(service.privateKey),
		PUBLIC_JWK: JSON.stringify(await exportJWK(service.publicKey)),
	};
});

beforeEach(async () => {
	await env.DB.prepare("DELETE FROM lti_records").run();
	sent = [];
	failure = false;
	tokenRedirect = false;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string | Request, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.url;
			// Exercise native Worker request validation before intercepting the network.
			new Request(url, init);
			expect(init?.redirect).toBe("manual");
			if (url === issuer + "/WebServices/lti13/jwk")
				return Response.json({ keys: [platformJwk] });
			if (url === issuer + "/WebServices/lti13/oauth2_token") {
				if (tokenRedirect)
					return new Response(null, {
						status: 302,
						headers: { Location: "https://untrusted.example/token" },
					});
				const form = new URLSearchParams(String(init!.body));
				const { payload } = await jwtVerify(form.get("client_assertion")!, toolKey, {
					algorithms: ["RS256"],
					issuer: bindings.CLIENT_ID,
					audience: issuer,
				});
				lastAssertion = payload;
				expect(payload.sub).toBe(bindings.CLIENT_ID);
				expect(form.get("scope")).toBe(SCOPE);
				return Response.json({ access_token: "test-service-token", scope: SCOPE });
			}
			if (url === issuer + "/WebServices/lti13/basic_outcome?tp_id=7") {
				expect(new Headers(init!.headers).get("Authorization")).toBe(
					"Bearer test-service-token",
				);
				sent.push(new XMLParser({ removeNSPrefix: true }).parse(String(init!.body)));
				return new Response(
					`<imsx_POXEnvelopeResponse xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0"><imsx_POXHeader><imsx_POXResponseHeaderInfo><imsx_statusInfo><imsx_codeMajor>${failure ? "failure" : "success"}</imsx_codeMajor></imsx_statusInfo></imsx_POXResponseHeaderInfo></imsx_POXHeader></imsx_POXEnvelopeResponse>`,
				);
			}
			throw new Error("Unexpected outbound request");
		}),
	);
});
afterEach(() => vi.restoreAllMocks());

function request(path: string, init: RequestInit = {}, current = bindings, origin = tool) {
	return worker.fetch(new Request(origin + path, init), current);
}
function resultId(pid = 42, issued = 1) {
	return base64url.encode(JSON.stringify({ pid, iat: issued })) + ".test-signature";
}
async function begin(
	options: {
		selection?: boolean;
		kind?: string;
		pid?: number;
		issued?: number;
		origin?: string;
		targetOrigin?: string;
		overrides?: Record<string, any>;
	} = {},
) {
	const origin = options.origin || tool;
	const target =
		(options.targetOrigin || origin) +
		"/lti/resource" +
		(options.selection
			? ""
			: "?" + new URLSearchParams({ item: item.id, view: options.kind || "deck" }));
	const start = await request(
		"/lti/login?" +
			new URLSearchParams({
				iss: issuer,
				client_id: bindings.CLIENT_ID,
				login_hint: "123",
				lti_message_hint: "opaque-platform-hint",
				target_link_uri: target,
			}),
		{},
		bindings,
		origin,
	);
	expect(start.status).toBe(200);
	const html = await start.text();
	const auth = JSON.parse(html.match(/location.replace\(("[^"]*")\)/)![1]!);
	const params = new URL(auth).searchParams;
	const binding = JSON.parse(html.match(/flow\.'\+"[^"]+",("[^"]+")/)![1]!);
	const claims = {
		iss: issuer,
		aud: bindings.CLIENT_ID,
		sub: 123,
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 120,
		nonce: params.get("nonce"),
		[LTI + "version"]: "1.3.0",
		[LTI + "deployment_id"]: "na",
		[LTI + "target_link_uri"]: target,
		[LTI + "resource_link"]: { id: "assignment-1" },
		[LTI + "message_type"]: options.selection
			? "LtiDeepLinkingRequest"
			: "LtiResourceLinkRequest",
		[LTI + "roles"]: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"],
		[DL + "deep_linking_settings"]: {
			accept_types: ["ltiResourceLink"],
			data: "selection-data",
			deep_link_return_url: issuer + "/WebServices/lti13/lti_deep_linking_response?tp_id=7",
		},
		[BO + "claim/basicoutcome"]: {
			lis_result_sourcedid: resultId(options.pid, options.issued),
			lis_outcome_service_url: issuer + "/WebServices/lti13/basic_outcome?tp_id=7",
		},
		...options.overrides,
	};
	const state = params.get("state")!;
	const encoded = await new SignJWT(claims as unknown as JWTPayload)
		.setProtectedHeader({ alg: "RS256", kid: "platform" })
		.sign(platformKey);
	const launch = () =>
		request(
			"/lti/launch",
			{
				method: "POST",
				body: new URLSearchParams({ state, id_token: encoded }),
			},
			bindings,
			origin,
		);
	return { launch, binding, state, encoded, redirectUri: params.get("redirect_uri") };
}
async function open(options: Parameters<typeof begin>[0] = {}): Promise<string> {
	const origin = options.origin || tool;
	const flow = await begin(options),
		launch = await flow.launch();
	expect(launch.status).toBe(200);
	const html = await launch.text();
	const ticket = JSON.parse(html.match(/ticket:("[^"]+")/)![1]!);
	const exchange = await request(
		"/lti/exchange",
		{
			method: "POST",
			headers: { Origin: origin, "Content-Type": "application/json" },
			body: JSON.stringify({ ticket, binding: flow.binding }),
		},
		bindings,
		origin,
	);
	expect(exchange.status).toBe(200);
	return ((await exchange.json()) as any).token;
}
function api(path: string, secret: string, data?: unknown, origin = tool) {
	return request(
		"/lti/" + path,
		{
			method: data === undefined ? "GET" : "POST",
			headers: {
				Authorization: "Bearer " + secret,
				Origin: origin,
				"Content-Type": "application/json",
			},
			...(data === undefined ? {} : { body: JSON.stringify(data) }),
		},
		bindings,
		origin,
	);
}
async function finish(secret: string, correct = true, origin = tool) {
	for (let index = 0; index < item.slides; index++)
		expect((await api("progress", secret, { event: "slide", index }, origin)).status).toBe(200);
	for (const question of item.questions)
		expect(
			(
				await api(
					"answer",
					secret,
					{
						question: question.id,
						option: correct
							? question.correct
							: (question.correct + 1) % question.options.length,
					},
					origin,
				)
			).status,
		).toBe(200);
}

test("public browsing and lesson links need no LMS session or signing key", async () => {
	expect((await request("/", {}, { ...bindings, PRIVATE_KEY_PEM: undefined })).status).toBe(200);
	expect((await request("/library/catalog.json")).status).toBe(200);
	const shared = await request(
		"/lti/resource?" + new URLSearchParams({ item: item.id, view: "deck" }),
	);
	expect(shared.status).toBe(302);
	expect(shared.headers.get("Location")).toBe(
		tool + "/?" + new URLSearchParams({ item: item.id, view: "deck" }),
	);
	expect((await request("/lti/session")).status).toBe(400);
	expect((await request("/cloudflare-data/lessons.json")).status).toBe(404);
	expect(sent).toHaveLength(0);
});

test("the old public home redirects while active LTI pages and media stay on their origin", async () => {
	const old = bindings.ALTERNATE_TOOL_URL!;
	const response = await request("/?item=community&view=video", {}, bindings, old);
	expect(response.status).toBe(308);
	expect(response.headers.get("Location")).toBe(tool + "/?item=community&view=video");
	expect((await request("/?lti=existing-browser-session", {}, bindings, old)).status).toBe(200);
	expect((await request("/library/catalog.json", {}, bindings, old)).status).toBe(200);
	expect((await request("/", {}, bindings, tool)).status).toBe(200);
});

test("legacy launches keep browser binding and resume the same attempt with one result", async () => {
	const current = await open();
	const progress = (await (
		await api("progress", current, { event: "slide", index: 0 })
	).json()) as any;
	expect(progress.progress).toBeGreaterThan(0);
	const old = bindings.ALTERNATE_TOOL_URL!;
	const flow = await begin({ origin: old });
	expect(flow.redirectUri).toBe(old + "/lti/launch");
	const legacy = await open({ origin: old });
	expect(((await (await api("session", legacy, undefined, old)).json()) as any).progress).toBe(
		progress.progress,
	);
	await finish(legacy, true, old);
	expect((await api("complete", legacy, {}, old)).status).toBe(200);
	expect(((await (await api("session", current)).json()) as any).reported).toBe(true);
	expect((await api("complete", current, {})).status).toBe(200);
	expect(sent).toHaveLength(1);
});

test("provider and lesson URLs may be migrated in either order", async () => {
	const old = bindings.ALTERNATE_TOOL_URL!;
	for (const [origin, targetOrigin] of [
		[tool, old],
		[old, tool],
	]) {
		const secret = await open({ origin, targetOrigin });
		expect((await api("session", secret, undefined, origin)).status).toBe(200);
	}
});

test("POST login initiation on the existing hostname is processed without redirecting", async () => {
	const old = bindings.ALTERNATE_TOOL_URL!;
	const response = await request(
		"/lti/login",
		{
			method: "POST",
			body: new URLSearchParams({
				iss: issuer,
				client_id: bindings.CLIENT_ID,
				login_hint: "123",
				lti_message_hint: "opaque-platform-hint",
				target_link_uri: old + "/lti/resource?item=" + item.id + "&view=video",
			}),
		},
		bindings,
		old,
	);
	expect(response.status).toBe(200);
	expect(response.headers.has("Location")).toBe(false);
	expect(await response.text()).toContain(encodeURIComponent(old + "/lti/launch"));
});

test("migration keeps strict host and request Origin checks", async () => {
	expect((await request("/health", {}, bindings, "https://untrusted.example")).status).toBe(400);
	const secret = await open({ origin: bindings.ALTERNATE_TOOL_URL });
	expect(
		(
			await request("/lti/progress", {
				method: "POST",
				headers: {
					Authorization: "Bearer " + secret,
					Origin: bindings.ALTERNATE_TOOL_URL!,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ event: "slide", index: 0 }),
			})
		).status,
	).toBe(400);
	const invalid = { ...bindings, ALTERNATE_TOOL_URL: "https://untrusted.example/path" };
	expect((await request("/health", {}, invalid)).status).toBe(400);
});

test("selection returns a signed single lesson link", async () => {
	const secret = await open({ selection: true });
	const response = await api("select", secret, { item: item.id, kind: "video" });
	expect(response.status).toBe(200);
	const data = (await response.json()) as any;
	const { payload } = await jwtVerify(data.jwt, toolKey, {
		algorithms: ["RS256"],
		issuer: bindings.CLIENT_ID,
		audience: issuer,
	});
	expect(payload[DL + "data"]).toBe("selection-data");
	const items = payload[DL + "content_items"] as any[];
	expect(items).toHaveLength(1);
	expect(items[0].url).toContain("view=video");
	expect(data.action).toBe(issuer + "/WebServices/lti13/lti_deep_linking_response?tp_id=7");
});

test("scores are calculated on the server and completion is reported once", async () => {
	const secret = await open();
	expect(await (await api("session", secret)).text()).not.toContain('"correct"');
	await finish(secret);
	const response = await api("complete", secret, { score: 0 });
	const data = (await response.json()) as any;
	expect(response.status).toBe(200);
	expect(data.result.score).toBe(1);
	expect(data.reported).toBe(true);
	const record = sent[0].imsx_POXEnvelopeRequest.imsx_POXBody.replaceResultRequest.resultRecord;
	expect(record.sourcedGUID.sourcedId).toBe(resultId());
	expect(record.blossom_extra.completion_state).toBe("Yes");
	expect(lastAssertion.aud).toBe(issuer);
	expect((await api("complete", secret, {})).status).toBe(200);
	expect(sent).toHaveLength(1);
	expect(
		(await api("answer", secret, { question: item.questions[0]!.id, option: 0 })).status,
	).toBe(400);
});

test("failed score delivery is frozen and retryable", async () => {
	const secret = await open();
	await finish(secret, false);
	failure = true;
	expect((await api("complete", secret, {})).status).toBe(502);
	const before = (await (await api("session", secret)).json()) as any;
	expect(before.result.score).toBe(0);
	expect(before.result.completion).toBe("Scorm_fail");
	expect(before.reported).toBe(false);
	failure = false;
	const after = (await (await api("complete", secret, {})).json()) as any;
	expect(after.result).toEqual(before.result);
	expect(after.reported).toBe(true);
});

test("platform redirects are rejected and a result can be retried safely", async () => {
	const secret = await open();
	await finish(secret);
	tokenRedirect = true;
	expect((await api("complete", secret, {})).status).toBe(502);
	expect(sent).toHaveLength(0);
	expect(((await (await api("session", secret)).json()) as any).reported).toBe(false);
	tokenRedirect = false;
	expect((await api("complete", secret, {})).status).toBe(200);
	expect(sent).toHaveLength(1);
});

test("a refreshed result token resumes the same attempt and a new attempt starts empty", async () => {
	const first = await open();
	await finish(first);
	const second = await open({ issued: 999 });
	const restored = (await (await api("session", second)).json()) as any;
	expect(restored.ready).toBe(true);
	expect(Object.keys(restored.answers)).toHaveLength(item.questions.length);
	await api("complete", second, {});
	expect(
		sent[0].imsx_POXEnvelopeRequest.imsx_POXBody.replaceResultRequest.resultRecord.sourcedGUID
			.sourcedId,
	).toBe(resultId(42, 999));
	const fresh = (await (await api("session", await open({ pid: 43 }))).json()) as any;
	expect(fresh.progress).toBe(0);
	expect(fresh.answers).toEqual({});
});

test("invalid signature claims, callbacks, roles and launch replay are rejected", async () => {
	for (const overrides of [
		{ aud: "another-tool" },
		{ nonce: "wrong" },
		{ iat: Math.floor(Date.now() / 1000) + 1000, exp: Math.floor(Date.now() / 1000) + 1120 },
		{ [LTI + "deployment_id"]: "wrong" },
		{
			[BO + "claim/basicoutcome"]: {
				lis_result_sourcedid: resultId(),
				lis_outcome_service_url: "https://evil.example/result?tp_id=7",
			},
		},
	]) {
		expect((await (await begin({ overrides })).launch()).status).toBe(400);
	}
	const student = await begin({
		selection: true,
		overrides: {
			[LTI + "roles"]: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
		},
	});
	expect((await student.launch()).status).toBe(400);
	const flow = await begin();
	expect((await flow.launch()).status).toBe(200);
	expect((await flow.launch()).status).toBe(400);
	const forged = await begin();
	const parts = forged.encoded.split(".");
	parts[2] = "A".repeat(parts[2]!.length);
	expect(
		(
			await request("/lti/launch", {
				method: "POST",
				body: new URLSearchParams({ state: forged.state, id_token: parts.join(".") }),
			})
		).status,
	).toBe(400);
});

test("browser binding and a one-use exchange prevent forwarded launches", async () => {
	const flow = await begin(),
		launch = await flow.launch();
	const ticket = JSON.parse((await launch.text()).match(/ticket:("[^"]+")/)![1]!);
	const exchange = (binding: string) =>
		request("/lti/exchange", {
			method: "POST",
			headers: { Origin: tool, "Content-Type": "application/json" },
			body: JSON.stringify({ ticket, binding }),
		});
	expect((await exchange("different-browser")).status).toBe(400);
	expect((await exchange(flow.binding)).status).toBe(200);
	expect((await exchange(flow.binding)).status).toBe(400);
});

test("progress, question and origin checks prevent an early or forged completion", async () => {
	const secret = await open();
	expect((await api("complete", secret, {})).status).toBe(400);
	expect((await api("progress", secret, { event: "slide", index: true })).status).toBe(400);
	expect((await api("progress", secret, { event: "slide", index: item.slides })).status).toBe(
		400,
	);
	expect((await api("answer", secret, { question: "unknown", option: 0 })).status).toBe(400);
	expect(
		(
			await request("/lti/complete", {
				method: "POST",
				headers: { Origin: "https://evil.example", Authorization: "Bearer " + secret },
			})
		).status,
	).toBe(400);
	expect(sent).toHaveLength(0);
});

test("D1 atomically consumes a flow and preserves concurrent attempt edits", async () => {
	const store = new Store(bindings.DB);
	await store.put("flow", "one-use", { value: 1 }, 300);
	const consumed = await Promise.allSettled([
		store.take("flow", "one-use"),
		store.take("flow", "one-use"),
	]);
	expect(consumed.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	await store.put("attempt", "concurrent", { count: 0 }, 300);
	await Promise.all(
		Array.from({ length: 4 }, () =>
			store.change<{ count: number }>("attempt", "concurrent", (value) => {
				value.count++;
			}),
		),
	);
	expect((await store.get<{ count: number }>("attempt", "concurrent")).count).toBe(4);
});

test("video seeking and instant events do not count as viewing coverage", async () => {
	const secret = await open({ kind: "video" });
	const at = Date.now(),
		clock = vi.spyOn(Date, "now").mockReturnValue(at);
	for (let position = 0; position < 20; position++)
		await api("progress", secret, { event: "video", position, rate: 1, playing: true });
	let state = (await (await api("session", secret)).json()) as any;
	expect(state.ready).toBe(false);
	expect(state.progress).toBeLessThan(0.02);
	await api("progress", secret, { event: "video", position: 0, rate: 1, playing: true });
	for (let position = 5; position < item.duration!; position += 5) {
		clock.mockReturnValue(at + position * 1000);
		await api("progress", secret, { event: "video", position, rate: 1, playing: true });
	}
	state = (await (await api("session", secret)).json()) as any;
	expect(state.ready).toBe(true);
});

test("public keys expose no private material and expired records are cleaned up", async () => {
	const key = (await (await request("/lti/jwks")).json()) as any;
	expect(key.keys[0].kty).toBe("RSA");
	expect(key.keys[0].d).toBeUndefined();
	const store = new Store(bindings.DB);
	await store.put("session", await digest("expired"), {}, -1);
	await worker.scheduled({} as ScheduledController, bindings);
	expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM lti_records").first("count")).toBe(
		0,
	);
});
