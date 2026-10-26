export type LearningProgress =
	| { event: "slide"; index: number }
	| { event: "video"; position: number; rate: number; playing: boolean };

export interface AttemptState {
	itemId: string;
	kind: "deck" | "video";
	reporting: boolean;
	questions: { id: string; question: string; options: string[] }[];
	answers: Record<string, number>;
	progress: number;
	ready: boolean;
	result: { score: number; completion: "Yes" | "Scorm_fail" } | null;
	reported: boolean;
}

export type LtiSession = { mode: "select" } | ({ mode: "activity" } & AttemptState);

export class LtiClient {
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly token: string,
		private readonly transport: typeof fetch = (input, init) => fetch(input, init),
	) {}

	private async request<T>(path: string, data?: unknown): Promise<T> {
		let response: Response;
		try {
			response = await this.transport(`/lti/${path}`, {
				method: data === undefined ? "GET" : "POST",
				headers: {
					Authorization: `Bearer ${this.token}`,
					...(data === undefined ? {} : { "Content-Type": "application/json" }),
				},
				...(data === undefined ? {} : { body: JSON.stringify(data) }),
				credentials: "omit",
			});
		} catch {
			throw new Error("החיבור לשירות הלמידה לא זמין. נסו שוב.");
		}
		let result;
		try {
			result = await response.json();
		} catch {
			throw new Error("לא התקבלה תשובה תקינה משירות הלמידה. נסו שוב.");
		}
		if (!response.ok) throw new Error(result.message || "לא ניתן לשמור את ההתקדמות. נסו שוב.");
		return result as T;
	}

	load(): Promise<LtiSession> {
		return this.request("session");
	}

	// Keep player events and answers in order; a failed request must not block a retry.
	private ordered<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.queue.then(operation);
		this.queue = next.catch(() => undefined);
		return next;
	}

	progress(event: LearningProgress): Promise<AttemptState> {
		return this.ordered(() => this.request("progress", event));
	}

	answer(question: string, option: number): Promise<AttemptState> {
		return this.ordered(() => this.request("answer", { question, option }));
	}

	complete(): Promise<AttemptState> {
		return this.ordered(() => this.request("complete", {}));
	}

	select(item: string, kind: "deck" | "video"): Promise<{ action: string; jwt: string }> {
		return this.request("select", { item, kind });
	}
}

export function browserLtiClient(id: string): LtiClient {
	const token = window.sessionStorage.getItem(`davinci.lti.session.${id}`);
	if (!token) throw new Error("פתחו את השיעור מחדש מתוך הקורס.");
	return new LtiClient(token);
}

export function submitSelection(selection: { action: string; jwt: string }) {
	const form = document.createElement("form");
	form.method = "POST";
	form.action = selection.action;
	const input = document.createElement("input");
	input.type = "hidden";
	input.name = "JWT";
	input.value = selection.jwt;
	form.append(input);
	document.body.append(form);
	form.submit();
}
