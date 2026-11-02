import type {
	CatalogDocument,
	CatalogSnapshot,
	CatalogRevision,
	GalleryDefinition,
	HistoryEntry,
	LearningItem,
} from "../src/models/catalog";
export class CatalogError extends Error {
	status: number;
	constructor(message: string, status?: number);
}
export interface StoredHistory {
	id: string;
	at: string;
	action: string;
	revision: CatalogRevision;
	items?: LearningItem[];
	galleries?: GalleryDefinition[];
	catalogMetadata?: Record<string, unknown>;
	count?: number;
}
export interface CatalogState extends CatalogSnapshot {
	catalogMetadata: Record<string, unknown>;
	history: StoredHistory[];
}
export interface CatalogStorage {
	read(): Promise<CatalogState>;
	write(next: CatalogState, before: CatalogState): Promise<CatalogState | void>;
	history?(): Promise<StoredHistory[]>;
	snapshot?(id: string): Promise<StoredHistory | null>;
}
export const defaultGalleries: GalleryDefinition[];
export function validateDocument(value: unknown): CatalogDocument;
export function validateCatalog(value: unknown, galleries?: GalleryDefinition[]): LearningItem[];
export function validateGalleries(value: unknown): GalleryDefinition[];
export function galleryOf(item: Pick<LearningItem, "gallery" | "unlisted">): string;
export function documentOf(state: CatalogState): CatalogDocument;
export function stateFromDocument(
	value: unknown,
	revision?: CatalogRevision,
	updatedAt?: string | null,
): CatalogState;
export class CatalogDomain {
	constructor(storage: CatalogStorage);
	read(): Promise<CatalogState>;
	history(): Promise<HistoryEntry[]>;
	mutate(
		revision: string | undefined,
		items: unknown,
		action?: unknown,
		restoreId?: string,
	): Promise<CatalogState>;
	importCatalog(
		revision: string | undefined,
		value: unknown,
		mode: unknown,
	): Promise<CatalogState>;
	mutateGallery(
		revision: string | undefined,
		input: Record<string, unknown>,
	): Promise<CatalogState>;
}
