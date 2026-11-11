import { useEffect, useState } from "react";

const emptyProgress: ReadonlySet<string> = new Set();

function completedLessons(value: string | null): Set<string> {
	try {
		const parsed: unknown = JSON.parse(value ?? "[]");
		if (Array.isArray(parsed)) return new Set(parsed.filter((id) => typeof id === "string"));
	} catch {
		// A damaged entry can be replaced the next time the learner marks a lesson.
	}
	return new Set();
}

export function useCourseProgress(courseId?: string) {
	const key = courseId ? `davinci.library.course.${courseId}.completed.v1` : undefined;
	const [progress, setProgress] = useState<{
		key: string;
		completed: Set<string>;
		saved: boolean;
	}>();
	const current = progress?.key === key ? progress : undefined;
	const completed = current?.completed ?? emptyProgress;

	useEffect(() => {
		if (!key) return;
		let storage: Storage;
		try {
			storage = window.localStorage;
			setProgress({ key, completed: completedLessons(storage.getItem(key)), saved: true });
		} catch {
			setProgress({ key, completed: new Set(), saved: false });
			return;
		}
		const sync = (event: StorageEvent) => {
			if (event.storageArea !== storage || (event.key !== key && event.key !== null)) return;
			setProgress({ key, completed: completedLessons(event.newValue), saved: true });
		};
		window.addEventListener("storage", sync);
		return () => window.removeEventListener("storage", sync);
	}, [key]);

	function toggle(lessonId: string) {
		if (!key) return;
		let next = new Set(completed);
		try {
			if (current?.saved !== false) next = completedLessons(window.localStorage.getItem(key));
		} catch {
			// Use this tab's progress when local storage is unavailable.
		}
		if (next.has(lessonId)) next.delete(lessonId);
		else next.add(lessonId);
		let saved = false;
		try {
			window.localStorage.setItem(key, JSON.stringify([...next]));
			saved = true;
		} catch {
			// Keep the current tab usable when storage is blocked or full.
		}
		setProgress({ key, completed: next, saved });
	}

	return { completed, ready: current !== undefined, saved: current?.saved, toggle };
}
