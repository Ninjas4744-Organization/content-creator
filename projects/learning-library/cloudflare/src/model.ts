export interface Env {
	ASSETS: Fetcher;
	DB: D1Database;
	TOOL_URL: string;
	ALTERNATE_TOOL_URL?: string;
	PLATFORM_ISSUER: string;
	CLIENT_ID: string;
	DEPLOYMENT_ID: string;
	KEY_ID: string;
	PASS_SCORE: string;
	SESSION_SECONDS: string;
	RETENTION_DAYS: string;
	PRIVATE_KEY_PEM?: string;
	PUBLIC_JWK?: string;
	ALLOW_LOCAL_HTTP?: string;
}

export type Kind = "deck" | "video";
export interface Question {
	id: string;
	question: string;
	options: string[];
	correct: number;
}
export interface Lesson {
	id: string;
	title: string;
	description: string;
	slides: number;
	duration: number | null;
	deck: string | null;
	video: string | null;
	questions: Question[];
}
export interface Result {
	id: string;
	score: number;
	completion: "Yes" | "Scorm_fail";
	seconds: number;
}
export interface Attempt {
	item: string;
	kind: Kind;
	slides: number;
	duration: number | null;
	questions: Question[];
	answers: Record<string, number>;
	viewed: number[];
	watched: [number, number][];
	lastVideo: { at: number; position: number; rate: number; playing: boolean } | null;
	playbackWall: number;
	sourcedid: string;
	outcomeUrl: string;
	created: number;
	result: Result | null;
	reported: boolean;
	reportLock: number;
	reportOwner?: string;
}
export type Session =
	{ mode: "select"; returnUrl: string; data?: unknown } | { mode: "activity"; attempt: string };
export interface Flow {
	nonce: string;
	binding: string;
	target: string;
}
export interface Exchange {
	binding: string;
	session: Session;
}
export class InputError extends Error {}
export class ConflictError extends Error {}
export const now = () => Date.now() / 1000;

export function object(value: unknown): Record<string, any> {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new InputError("Invalid object");
	return value as Record<string, any>;
}

export function settings(env: Env) {
	for (const value of [
		env.TOOL_URL,
		env.PLATFORM_ISSUER,
		...(env.ALTERNATE_TOOL_URL ? [env.ALTERNATE_TOOL_URL] : []),
	]) {
		const url = new URL(value);
		const local =
			env.ALLOW_LOCAL_HTTP === "true" &&
			["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
		if (
			(url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			value.endsWith("/")
		)
			throw new InputError("Invalid service URL");
	}
	if (
		new URL(env.TOOL_URL).origin !== env.TOOL_URL ||
		(env.ALTERNATE_TOOL_URL &&
			new URL(env.ALTERNATE_TOOL_URL).origin !== env.ALTERNATE_TOOL_URL) ||
		!env.CLIENT_ID ||
		!env.DEPLOYMENT_ID ||
		!env.KEY_ID
	)
		throw new InputError("Invalid registration");
	const pass = Number(env.PASS_SCORE),
		session = Number(env.SESSION_SECONDS),
		retention = Number(env.RETENTION_DAYS);
	if (
		!Number.isFinite(pass) ||
		pass < 0 ||
		pass > 1 ||
		!Number.isInteger(session) ||
		session < 300 ||
		!Number.isInteger(retention) ||
		retention < 1
	)
		throw new InputError("Invalid service settings");
	return { pass, session, retention, platformOrigin: new URL(env.PLATFORM_ISSUER).origin };
}

/** Keep every login flow on its starting origin, including existing LMS registrations. */
export function registrationForOrigin(env: Env, origin: string): Env {
	if (origin === env.TOOL_URL) return env;
	if (origin === env.ALTERNATE_TOOL_URL)
		return { ...env, TOOL_URL: origin, ALTERNATE_TOOL_URL: env.TOOL_URL };
	throw new InputError("Invalid tool origin");
}

export function platformUrl(env: Env, endpoint: string): string {
	return `${env.PLATFORM_ISSUER}/WebServices/lti13/${endpoint}`;
}
export function callback(env: Env, value: unknown, endpoint: string): string {
	if (typeof value !== "string") throw new InputError("Invalid callback");
	const url = new URL(value),
		expected = new URL(platformUrl(env, endpoint));
	if (
		url.origin !== expected.origin ||
		url.pathname !== expected.pathname ||
		url.username ||
		url.password ||
		url.hash ||
		url.searchParams.size !== 1 ||
		!/^[0-9]+$/.test(url.searchParams.get("tp_id") || "")
	)
		throw new InputError("Invalid callback");
	return value;
}
export function resource(env: Env, value: string): { item: string; kind: Kind } | null {
	const url = new URL(value);
	if (
		(url.origin !== env.TOOL_URL && url.origin !== env.ALTERNATE_TOOL_URL) ||
		url.pathname !== "/lti/resource" ||
		url.username ||
		url.password ||
		url.hash
	)
		throw new InputError("Invalid resource");
	if (!url.searchParams.size) return null;
	const item = url.searchParams.get("item"),
		kind = url.searchParams.get("view");
	if (
		url.searchParams.size !== 2 ||
		!item ||
		!/^[a-z0-9][a-z0-9-]*$/.test(item) ||
		(kind !== "deck" && kind !== "video")
	)
		throw new InputError("Invalid lesson");
	return { item, kind };
}
