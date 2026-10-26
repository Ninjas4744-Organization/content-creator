import { InputError, now, type Attempt } from "./model";

export function publicAttempt(attempt: Attempt) {
	const fraction =
		attempt.kind === "deck"
			? attempt.viewed.length / attempt.slides
			: Math.min(
					1,
					attempt.watched.reduce((sum, [start, end]) => sum + end - start, 0) /
						attempt.duration!,
				);
	return {
		itemId: attempt.item,
		kind: attempt.kind,
		reporting: !!attempt.sourcedid,
		questions: attempt.questions.map(({ id, question, options }) => ({
			id,
			question,
			options,
		})),
		answers: attempt.answers,
		progress: Math.round(fraction * 10000) / 10000,
		ready: fraction >= (attempt.kind === "deck" ? 1 : 0.9),
		result: attempt.result,
		reported: attempt.reported,
	};
}

export function recordProgress(attempt: Attempt, data: Record<string, any>): void {
	if (attempt.result) return;
	if (attempt.kind === "deck" && data.event === "slide") {
		if (!Number.isInteger(data.index) || data.index < 0 || data.index >= attempt.slides)
			throw new InputError("Invalid slide");
		attempt.viewed = [...new Set([...attempt.viewed, data.index])].sort((a, b) => a - b);
	} else if (attempt.kind === "video" && data.event === "video") {
		const { position, rate, playing } = data;
		if (
			typeof position !== "number" ||
			!Number.isFinite(position) ||
			position < 0 ||
			position > attempt.duration! + 1 ||
			typeof rate !== "number" ||
			rate < 0.5 ||
			rate > 2 ||
			!Number.isFinite(rate) ||
			typeof playing !== "boolean"
		)
			throw new InputError("Invalid video progress");
		const at = now(),
			previous = attempt.lastVideo;
		if (previous?.playing) {
			const elapsed = at - previous.at,
				delta = position - previous.position;
			attempt.playbackWall += Math.max(0, Math.min(10, elapsed));
			if (delta > 0 && delta <= Math.min(15, elapsed * Math.max(rate, previous.rate) + 1)) {
				const intervals: [number, number][] = [
					...attempt.watched,
					[previous.position, Math.min(position, attempt.duration!)] as [number, number],
				].sort((a, b) => a[0] - b[0]);
				const merged: [number, number][] = [];
				for (const [start, end] of intervals) {
					const last = merged[merged.length - 1];
					if (last && start <= last[1] + 0.05) last[1] = Math.max(last[1], end);
					else merged.push([start, end]);
				}
				if (
					merged.reduce((sum, [start, end]) => sum + end - start, 0) <=
					attempt.playbackWall * 2 + 1
				)
					attempt.watched = merged;
			}
		}
		attempt.lastVideo = { at, position, rate, playing };
	} else throw new InputError("Incorrect lesson format");
}

export function recordAnswer(attempt: Attempt, data: Record<string, any>): void {
	if (attempt.result) throw new InputError("Result already submitted");
	const question = attempt.questions.find((q) => q.id === data.question);
	if (
		!question ||
		!Number.isInteger(data.option) ||
		data.option < 0 ||
		data.option >= question.options.length
	)
		throw new InputError("Invalid question or answer");
	attempt.answers[question.id] = data.option;
}
