import lessonData from "../../output/cloudflare-data/lessons.json";
import {
	ConflictError,
	InputError,
	callback,
	now,
	object,
	platformUrl,
	resource,
	registrationForOrigin,
	settings,
	type Attempt,
	type Env,
	type Exchange,
	type Flow,
	type Kind,
	type Lesson,
	type Session,
} from "./model";
import { BO, DL, LTI, Protocol, digest, performanceIdentity, same, token } from "./protocol";
import { Store } from "./store";
import { publicAttempt, recordAnswer, recordProgress } from "./learning";
import { video } from "./media";

const lessons = lessonData as Record<string, Lesson>;
const json = (value: unknown, status = 200) => Response.json(value, { status });
const scriptValue = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");

function lesson(id: string, kind: Kind): Lesson {
	const item = Object.hasOwn(lessons, id) ? lessons[id] : undefined;
	if (!item || (kind !== "deck" && kind !== "video") || !item[kind])
		throw new InputError("Unknown lesson");
	return item;
}

async function body(request: Request): Promise<string> {
	if (!request.body) return "";
	const reader = request.body.getReader(),
		chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const result = await reader.read();
		if (result.done) break;
		size += result.value.byteLength;
		if (size > 131072) {
			await reader.cancel();
			throw new InputError("Request too large");
		}
		chunks.push(result.value);
	}
	const output = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}
	return new TextDecoder().decode(output);
}

class Router {
	stage = "request";
	private readonly store: Store;
	private readonly protocol: Protocol;
	private readonly config;
	private nonce = "";
	constructor(
		private readonly request: Request,
		private readonly env: Env,
	) {
		this.config = settings(env);
		this.store = new Store(env.DB);
		this.protocol = new Protocol(env);
	}
	private page(script: string): Response {
		this.nonce = token();
		return new Response(
			`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>דה וינצ׳י · למידה</title><style>body{background:#08152b;color:#fafcff;font:18px Arial,sans-serif;max-width:700px;margin:12vh auto;padding:24px;line-height:1.8}</style><p id="status" role="status">פותחים את השיעור…</p><script nonce="${this.nonce}">${script}</script></html>`,
			{ headers: { "Content-Type": "text/html; charset=utf-8" } },
		);
	}
	headers(response: Response): Response {
		const output = new Response(response.body, response);
		output.headers.set("Referrer-Policy", "no-referrer");
		output.headers.set("X-Content-Type-Options", "nosniff");
		output.headers.set("Cache-Control", "no-store");
		output.headers.set(
			"Content-Security-Policy",
			`default-src 'none'; script-src 'nonce-${this.nonce}'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self' ${this.config.platformOrigin}; base-uri 'none'; form-action ${this.config.platformOrigin}`,
		);
		return output;
	}
	private checkOrigin(): void {
		if (this.request.headers.get("Origin") !== this.env.TOOL_URL)
			throw new InputError("Invalid origin");
	}
	private async session(mode?: Session["mode"]): Promise<Session> {
		const authorization = this.request.headers.get("Authorization") || "";
		if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization))
			throw new InputError("Invalid session");
		if (this.request.method === "POST") this.checkOrigin();
		const value = await this.store.get<Session>(
			"session",
			await digest(authorization.slice(7)),
		);
		if (mode && value.mode !== mode) throw new InputError("Invalid session operation");
		return value;
	}
	private async activity(): Promise<string> {
		const value = await this.session("activity");
		if (value.mode !== "activity") throw new InputError("Invalid session");
		return value.attempt;
	}
	private async payload(): Promise<Record<string, any>> {
		if (!this.request.headers.get("Content-Type")?.startsWith("application/json"))
			throw new InputError("Expected JSON");
		return object(JSON.parse(await body(this.request)));
	}
	private async login(): Promise<Response> {
		const args =
			this.request.method === "GET"
				? new URL(this.request.url).searchParams
				: new URLSearchParams(await body(this.request));
		if (
			args.get("iss") !== this.env.PLATFORM_ISSUER ||
			(args.get("client_id") || this.env.CLIENT_ID) !== this.env.CLIENT_ID ||
			(args.get("lti_deployment_id") || this.env.DEPLOYMENT_ID) !== this.env.DEPLOYMENT_ID ||
			!args.get("login_hint") ||
			!args.get("lti_message_hint")
		)
			throw new InputError("Invalid platform registration");
		const target = args.get("target_link_uri") || "";
		resource(this.env, target);
		const state = token(),
			nonce = token(),
			binding = token();
		await this.store.put(
			"flow",
			state,
			{ nonce, binding: await digest(binding), target } satisfies Flow,
			300,
		);
		const auth =
			platformUrl(this.env, "auth") +
			"?" +
			new URLSearchParams({
				scope: "openid",
				response_type: "id_token",
				response_mode: "form_post",
				prompt: "none",
				client_id: this.env.CLIENT_ID,
				redirect_uri: this.env.TOOL_URL + "/lti/launch",
				login_hint: args.get("login_hint")!,
				lti_message_hint: args.get("lti_message_hint")!,
				state,
				nonce,
			});
		return this.page(
			`try{sessionStorage.setItem('davinci.lti.flow.'+${scriptValue(state)},${scriptValue(binding)});location.replace(${scriptValue(auth)});}catch{document.querySelector('#status').textContent='הדפדפן חסם את האחסון הדרוש לפתיחת השיעור. פנו למנהל הקורס כדי לפתוח אותו בחלון נפרד.';}`,
		);
	}
	private async launch(): Promise<Response> {
		this.stage = "flow";
		const args = new URLSearchParams(await body(this.request)),
			state = args.get("state") || "";
		const flow = await this.store.get<Flow>("flow", state);
		this.stage = "signature";
		const claims = await this.protocol.verify(args.get("id_token") || "", flow.nonce);
		this.stage = "target";
		if (claims[LTI + "target_link_uri"] !== flow.target)
			throw new InputError("Invalid launch target");
		let session: Session;
		if (claims[LTI + "message_type"] === "LtiDeepLinkingRequest") {
			const deep = object(claims[DL + "deep_linking_settings"]);
			const roles = claims[LTI + "roles"];
			const allowed = new Set(
				["Instructor", "Administrator", "ContentDeveloper"].flatMap((role) =>
					["http", "https"].map(
						(scheme) =>
							`${scheme}://purl.imsglobal.org/vocab/lis/v2/membership#${role}`,
					),
				),
			);
			if (
				!Array.isArray(roles) ||
				!roles.some((role) => allowed.has(role)) ||
				!Array.isArray(deep.accept_types) ||
				!deep.accept_types.includes("ltiResourceLink")
			)
				throw new InputError("Selection is not allowed");
			session = {
				mode: "select",
				returnUrl: callback(
					this.env,
					deep.deep_link_return_url,
					"lti_deep_linking_response",
				),
				data: deep.data,
			};
		} else if (claims[LTI + "message_type"] === "LtiResourceLinkRequest") {
			const selected = resource(this.env, flow.target);
			if (!selected) throw new InputError("A lesson must be selected");
			const item = lesson(selected.item, selected.kind);
			this.stage = "resource_claims";
			const link = object(claims[LTI + "resource_link"]),
				outcome = object(claims[BO + "claim/basicoutcome"] || {});
			if (!["string", "number"].includes(typeof link.id) || !link.id)
				throw new InputError("Invalid resource link");
			const sourcedid = outcome.lis_result_sourcedid ?? "";
			if (typeof sourcedid !== "string") throw new InputError("Invalid result identifier");
			const outcomeUrl = sourcedid
				? callback(this.env, outcome.lis_outcome_service_url, "basic_outcome")
				: "";
			const identity = [
				this.env.PLATFORM_ISSUER,
				this.env.CLIENT_ID,
				this.env.DEPLOYMENT_ID,
				String(claims.sub),
				String(link.id),
				sourcedid ? performanceIdentity(sourcedid) : "preview",
			];
			const id = await digest(JSON.stringify(identity));
			this.stage = "attempt";
			const attempt: Attempt = {
				item: item.id,
				kind: selected.kind,
				slides: item.slides,
				duration: item.duration,
				questions: item.questions,
				answers: {},
				viewed: [],
				watched: [],
				lastVideo: null,
				playbackWall: 0,
				sourcedid,
				outcomeUrl,
				created: now(),
				result: null,
				reported: false,
				reportLock: 0,
			};
			if (selected.kind === "video" && (!item.duration || item.duration <= 0))
				throw new InputError("Invalid video duration");
			const current = await this.store.ensure(id, attempt, this.config.retention * 86400);
			if (current.item !== item.id || current.kind !== selected.kind)
				throw new InputError("Attempt belongs to another lesson");
			await this.store.change<Attempt>("attempt", id, (value) => {
				value.sourcedid = sourcedid;
				value.outcomeUrl = outcomeUrl;
			});
			session = { mode: "activity", attempt: id };
		} else throw new InputError("Unsupported LTI message");
		await this.store.take("flow", state);
		this.stage = "exchange";
		const ticket = token();
		await this.store.put(
			"exchange",
			await digest(ticket),
			{ binding: flow.binding, session } satisfies Exchange,
			120,
		);
		return this.page(
			`(async()=>{try{const binding=sessionStorage.getItem('davinci.lti.flow.'+${scriptValue(state)});if(!binding)throw new Error();const response=await fetch('/lti/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket:${scriptValue(ticket)},binding})});if(!response.ok)throw new Error();const data=await response.json();sessionStorage.removeItem('davinci.lti.flow.'+${scriptValue(state)});sessionStorage.setItem('davinci.lti.session.'+data.id,data.token);location.replace('/?lti='+encodeURIComponent(data.id));}catch{document.querySelector('#status').textContent='לא ניתן לפתוח את השיעור. חזרו לקורס ופתחו אותו שוב.';}})();`,
		);
	}
	private async exchange(): Promise<Response> {
		this.checkOrigin();
		const { ticket, binding } = await this.payload();
		if (typeof ticket !== "string" || typeof binding !== "string")
			throw new InputError("Invalid exchange");
		const value = await this.store.get<Exchange>("exchange", await digest(ticket));
		if (!same(value.binding, await digest(binding)))
			throw new InputError("Wrong browser binding");
		await this.store.take("exchange", await digest(ticket));
		const secret = token(),
			id = token().slice(0, 16);
		await this.store.put("session", await digest(secret), value.session, this.config.session);
		return json({ id, token: secret });
	}
	private async complete(): Promise<Response> {
		const id = await this.activity(),
			owner = token();
		let attempt = await this.store.change<Attempt>("attempt", id, (value) => {
			if (value.reported) return;
			if (
				!value.sourcedid ||
				!publicAttempt(value).ready ||
				!value.questions.every((question) => Object.hasOwn(value.answers, question.id))
			)
				throw new InputError("Lesson is not ready");
			if (value.reportLock > now()) throw new ConflictError("Result is being sent");
			if (!value.result) {
				const score = value.questions.length
					? Math.round(
							(value.questions.filter((q) => value.answers[q.id] === q.correct)
								.length /
								value.questions.length) *
								10000,
						) / 10000
					: 1;
				value.result = {
					id: token(),
					score,
					completion: score >= this.config.pass ? "Yes" : "Scorm_fail",
					seconds: Math.max(
						0,
						Math.floor(
							value.kind === "video"
								? value.playbackWall
								: Math.min(this.config.session, now() - value.created),
						),
					),
				};
			}
			value.reportOwner = owner;
			value.reportLock = now() + 90;
		});
		if (!attempt.reported) {
			try {
				await this.protocol.report(attempt);
			} catch {
				await this.store.change<Attempt>("attempt", id, (current) => {
					if (current.reportOwner === owner) current.reportLock = 0;
				});
				return json(
					{
						error: "report_failed",
						message: "הדיווח לא הגיע לקורס. התוצאה נשמרה ואפשר לנסות שוב.",
					},
					502,
				);
			}
			attempt = await this.store.change<Attempt>("attempt", id, (current) => {
				if (current.reportOwner === owner) {
					current.reported = true;
					current.reportLock = 0;
				}
			});
		}
		return json(publicAttempt(attempt));
	}
	async route(path: string): Promise<Response> {
		const method = this.request.method;
		if (path === "/health" && method === "GET")
			return json({
				status: "ok",
				lti:
					this.env.PRIVATE_KEY_PEM && this.env.PUBLIC_JWK
						? "configured"
						: "setup_required",
			});
		if (path === "/lti/resource" && method === "GET") {
			const selected = resource(this.env, this.request.url);
			if (!selected) return Response.redirect(this.env.TOOL_URL + "/", 302);
			lesson(selected.item, selected.kind);
			return Response.redirect(
				this.env.TOOL_URL +
					"/?" +
					new URLSearchParams({ item: selected.item, view: selected.kind }),
				302,
			);
		}
		if (!this.env.PRIVATE_KEY_PEM || !this.env.PUBLIC_JWK)
			return json(
				{
					error: "setup_required",
					message: "חיבור הקורס עדיין בהכנה. אפשר לצפות בתוכן דרך הספרייה הציבורית.",
				},
				503,
			);
		if (path === "/lti/login" && (method === "GET" || method === "POST")) return this.login();
		if (path === "/lti/launch" && method === "POST") return this.launch();
		if (path === "/lti/exchange" && method === "POST") return this.exchange();
		if (path === "/lti/jwks" && method === "GET")
			return json({ keys: [this.protocol.publicKey()] });
		if (path === "/lti/session" && method === "GET") {
			const value = await this.session();
			return value.mode === "select"
				? json({ mode: "select" })
				: json({
						mode: "activity",
						...publicAttempt(await this.store.get<Attempt>("attempt", value.attempt)),
					});
		}
		if (path === "/lti/select" && method === "POST") {
			const value = await this.session("select"),
				data = await this.payload();
			if (value.mode !== "select" || typeof data.item !== "string")
				throw new InputError("Invalid selection");
			const item = lesson(data.item, data.kind);
			return json(await this.protocol.selection(value, item, data.kind));
		}
		if ((path === "/lti/progress" || path === "/lti/answer") && method === "POST") {
			const id = await this.activity(),
				data = await this.payload();
			const attempt = await this.store.change<Attempt>("attempt", id, (value) =>
				path === "/lti/progress" ? recordProgress(value, data) : recordAnswer(value, data),
			);
			return json(publicAttempt(attempt));
		}
		if (path === "/lti/complete" && method === "POST") return this.complete();
		return json({ error: "not_found" }, 404);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (
			url.origin === env.ALTERNATE_TOOL_URL &&
			url.pathname === "/" &&
			!url.searchParams.has("lti") &&
			["GET", "HEAD"].includes(request.method)
		)
			return Response.redirect(env.TOOL_URL + "/" + url.search, 308);
		if (url.pathname.endsWith(".mp4")) {
			const response = await video(request, env);
			if (response) return response;
		}
		if (!url.pathname.startsWith("/lti/") && url.pathname !== "/health")
			return env.ASSETS.fetch(request);
		let router: Router | undefined;
		let response: Response;
		try {
			settings(env);
			router = new Router(request, registrationForOrigin(env, url.origin));
			response = await router.route(url.pathname);
		} catch (error) {
			const code = error instanceof Error && "code" in error ? error.code : undefined;
			console.warn(
				JSON.stringify({
					event: "lti_request_rejected",
					path: url.pathname,
					stage: router?.stage || "configuration",
					category:
						error instanceof Error &&
						[
							"Error",
							"TypeError",
							"SyntaxError",
							"RangeError",
							"DataError",
							"OperationError",
							"NotSupportedError",
						].includes(error.name)
							? error.name
							: "validation",
					reason:
						error instanceof InputError
							? error.message
							: typeof code === "string" && /^ERR_[A-Z_]+$/.test(code)
								? code
								: "internal_error",
				}),
			);
			const status = error instanceof ConflictError ? 409 : 400;
			response = json(
				{
					error: "invalid_request",
					message:
						"לא ניתן להשלים את הפעולה. פתחו את השיעור שוב מתוך הקורס, או פנו למנהל הקורס.",
				},
				status,
			);
		}
		return router ? router.headers(response) : response;
	},
	async scheduled(_event: ScheduledController, env: Env): Promise<void> {
		await new Store(env.DB).prune();
	},
} satisfies ExportedHandler<Env>;
