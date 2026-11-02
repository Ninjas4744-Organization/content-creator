import type { SourceDocument, SourceSnapshot, SourceHistoryEntry } from "../src/models/sources";
import type { CatalogRevision } from "../src/models/catalog";
export interface SourceState {
	document: SourceDocument;
	revision: CatalogRevision;
	updatedAt: string | null;
	history: (Omit<SourceHistoryEntry, "count" | "backgroundCount"> & {
		revision: CatalogRevision;
		document: SourceDocument;
	})[];
}
export interface SourcesStorage {
	read(): Promise<SourceState>;
	write(next: SourceState, before: SourceState): Promise<SourceState | void>;
}
export function validateSourceDocument(value: unknown): SourceDocument;
export function initialSourceState(): SourceState;
export function sourceSnapshot(state: SourceState, mode: "local" | "production"): SourceSnapshot;
export function sourceHistory(state: SourceState): SourceHistoryEntry[];
export class SourcesDomain {
	constructor(storage: SourcesStorage);
	read(): Promise<SourceState>;
	change(revision: string | undefined, input: Record<string, unknown>): Promise<SourceState>;
}
