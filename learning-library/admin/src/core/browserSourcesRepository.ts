import { createApiClient } from "./browserRepository";
import type { SourcesRepository, SourceSnapshot, SourceHistoryEntry } from "../models/sources";

export function createBrowserSourcesRepository(): SourcesRepository {
	const { request, dispose } = createApiClient();
	return {
		load: () => request<SourceSnapshot>("/api/sources"),
		change: (input, revision) =>
			request<SourceSnapshot>("/api/sources", "POST", input, revision),
		history: async () =>
			(await request<{ history: SourceHistoryEntry[] }>("/api/sources/history")).history,
		dispose,
	};
}
