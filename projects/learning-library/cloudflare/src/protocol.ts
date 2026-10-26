import {
	SignJWT,
	base64url,
	createLocalJWKSet,
	decodeProtectedHeader,
	importPKCS8,
	jwtVerify,
	type JSONWebKeySet,
} from "jose";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
	InputError,
	callback,
	now,
	object,
	platformUrl,
	type Attempt,
	type Env,
	type Lesson,
	type Session,
	type Kind,
} from "./model";

export const LTI = "https://purl.imsglobal.org/spec/lti/claim/";
export const DL = "https://purl.imsglobal.org/spec/lti-dl/claim/";
export const BO = "https://purl.imsglobal.org/spec/lti-bo/";
export const SCOPE = BO + "scope/basicoutcome";
export const token = () => base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value: string): Promise<string> {
	return Array.from(
		new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
	)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
export function same(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
	return difference === 0;
}
export function performanceIdentity(value: string): string {
	// The outer, verified platform JWT authenticates this headerless result payload.
	if (value.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))
		throw new InputError("Invalid result identifier");
	const payload = object(
		JSON.parse(new TextDecoder().decode(base64url.decode(value.split(".")[0]!))),
	);
	if (
		!/^[0-9]+$/.test(String(payload.pid)) ||
		!Number.isSafeInteger(Number(payload.pid)) ||
		Number(payload.pid) <= 0
	)
		throw new InputError("Invalid attempt ID");
	return String(Number(payload.pid));
}

const jwks = new Map<string, { until: number; keys: JSONWebKeySet }>();
const privateKeys = new Map<string, Promise<CryptoKey>>();

async function remote(url: string, init?: RequestInit): Promise<string> {
	const response = await fetch(url, {
		...init,
		// Workers supports manual/follow; reject 3xx below instead of following them.
		redirect: "manual",
		signal: AbortSignal.timeout(15000),
	});
	if (!response.ok || Number(response.headers.get("Content-Length") || 0) > 1048576)
		throw new InputError("Platform request failed");
	if (!response.body) throw new InputError("Empty platform response");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	while (true) {
		const part = await reader.read();
		if (part.done) break;
		length += part.value.byteLength;
		if (length > 1048576) {
			await reader.cancel();
			throw new InputError("Platform response too large");
		}
		chunks.push(part.value);
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return new TextDecoder().decode(bytes);
}

export class Protocol {
	constructor(private readonly env: Env) {}
	publicKey(): Record<string, string> {
		const key = object(JSON.parse(this.env.PUBLIC_JWK || "{}"));
		if (key.kty !== "RSA" || typeof key.n !== "string" || typeof key.e !== "string")
			throw new InputError("Signing key is not configured");
		// Explicit allowlist: never expose private JWK fields.
		return { kty: "RSA", n: key.n, e: key.e, kid: this.env.KEY_ID, alg: "RS256", use: "sig" };
	}
	privateKey(): Promise<CryptoKey> {
		const pem = this.env.PRIVATE_KEY_PEM;
		if (!pem) throw new InputError("Signing key is not configured");
		let result = privateKeys.get(pem);
		if (!result) {
			result = importPKCS8(pem, "RS256").then((key) => {
				if (
					!("modulusLength" in key.algorithm) ||
					typeof key.algorithm.modulusLength !== "number" ||
					key.algorithm.modulusLength < 2048
				)
					throw new InputError("Invalid signing key size");
				return key;
			});
			privateKeys.set(pem, result);
		}
		return result;
	}
	async verify(value: string, nonce: string): Promise<Record<string, any>> {
		const header = decodeProtectedHeader(value);
		if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid)
			throw new InputError("Invalid signing header");
		const url = platformUrl(this.env, "jwk");
		let cached = jwks.get(url);
		if (!cached || cached.until < now()) {
			cached = { until: now() + 300, keys: JSON.parse(await remote(url)) as JSONWebKeySet };
			jwks.set(url, cached);
		}
		const { payload } = await jwtVerify(value, createLocalJWKSet(cached.keys), {
			algorithms: ["RS256"],
			issuer: this.env.PLATFORM_ISSUER,
			audience: this.env.CLIENT_ID,
			requiredClaims: ["iss", "aud", "sub", "iat", "exp", "nonce"],
			clockTolerance: 10,
		});
		const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
		if (
			(typeof payload.sub !== "string" && typeof payload.sub !== "number") ||
			!String(payload.sub) ||
			(audiences.length > 1 && payload.azp !== this.env.CLIENT_ID) ||
			(payload.azp !== undefined && payload.azp !== this.env.CLIENT_ID) ||
			typeof payload.nonce !== "string" ||
			!same(payload.nonce, nonce) ||
			payload[LTI + "version"] !== "1.3.0" ||
			payload[LTI + "deployment_id"] !== this.env.DEPLOYMENT_ID ||
			typeof payload.iat !== "number" ||
			typeof payload.exp !== "number" ||
			payload.iat > now() + 10 ||
			payload.exp <= payload.iat ||
			payload.exp - payload.iat > 300
		)
			throw new InputError("Invalid platform launch");
		return payload;
	}
	async sign(claims: Record<string, any>): Promise<string> {
		return new SignJWT(claims)
			.setProtectedHeader({ alg: "RS256", kid: this.env.KEY_ID })
			.setIssuedAt()
			.setExpirationTime("60s")
			.setJti(token())
			.sign(await this.privateKey());
	}
	async selection(session: Extract<Session, { mode: "select" }>, item: Lesson, kind: Kind) {
		const claims: Record<string, any> = {
			iss: this.env.CLIENT_ID,
			aud: this.env.PLATFORM_ISSUER,
			[LTI + "message_type"]: "LtiDeepLinkingResponse",
			[LTI + "version"]: "1.3.0",
			[LTI + "deployment_id"]: this.env.DEPLOYMENT_ID,
			[DL + "content_items"]: [
				{
					type: "ltiResourceLink",
					title: item.title,
					text: item.description,
					url:
						this.env.TOOL_URL +
						"/lti/resource?" +
						new URLSearchParams({ item: item.id, view: kind }),
					custom: { davinci_item: item.id, davinci_kind: kind },
				},
			],
		};
		if (session.data !== undefined && session.data !== null) claims[DL + "data"] = session.data;
		return { action: session.returnUrl, jwt: await this.sign(claims) };
	}
	async report(attempt: Attempt): Promise<void> {
		if (!attempt.result) throw new InputError("Missing result");
		// Preserve the existing platform's issuer audience and completion extension.
		const assertion = await this.sign({
			iss: this.env.CLIENT_ID,
			sub: this.env.CLIENT_ID,
			aud: this.env.PLATFORM_ISSUER,
		});
		const access = object(
			JSON.parse(
				await remote(platformUrl(this.env, "oauth2_token"), {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({
						grant_type: "client_credentials",
						scope: SCOPE,
						client_assertion_type:
							"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
						client_assertion: assertion,
					}),
				}),
			),
		);
		if (
			typeof access.access_token !== "string" ||
			!access.access_token ||
			/[\r\n]/.test(access.access_token) ||
			typeof access.scope !== "string" ||
			!access.scope.split(" ").includes(SCOPE)
		)
			throw new InputError("Result scope was not granted");
		const escape = (value: unknown) =>
			String(value).replace(
				/[<>&"']/g,
				(c) =>
					({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
			);
		const xml = `<?xml version="1.0" encoding="UTF-8"?><imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0"><imsx_POXHeader><imsx_POXRequestHeaderInfo><imsx_version>V1.0</imsx_version><imsx_messageIdentifier>${escape(attempt.result.id)}</imsx_messageIdentifier></imsx_POXRequestHeaderInfo></imsx_POXHeader><imsx_POXBody><replaceResultRequest><resultRecord><sourcedGUID><sourcedId>${escape(attempt.sourcedid)}</sourcedId></sourcedGUID><result><resultScore><language>en</language><textString>${attempt.result.score}</textString></resultScore></result><blossom_extra><completion_state>${attempt.result.completion}</completion_state><performance_time>${attempt.result.seconds}</performance_time></blossom_extra></resultRecord></replaceResultRequest></imsx_POXBody></imsx_POXEnvelopeRequest>`;
		const response = await remote(callback(this.env, attempt.outcomeUrl, "basic_outcome"), {
			method: "POST",
			headers: {
				"Content-Type": "application/xml",
				Authorization: "Bearer " + access.access_token,
			},
			body: xml,
		});
		if (/<!DOCTYPE|<!ENTITY/i.test(response) || XMLValidator.validate(response) !== true)
			throw new InputError("Invalid result response");
		const parsed = new XMLParser({ removeNSPrefix: true, processEntities: false }).parse(
			response,
		);
		if (
			parsed?.imsx_POXEnvelopeResponse?.imsx_POXHeader?.imsx_POXResponseHeaderInfo
				?.imsx_statusInfo?.imsx_codeMajor !== "success"
		)
			throw new InputError("Result was not accepted");
	}
}
