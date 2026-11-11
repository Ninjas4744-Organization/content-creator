export type MediaKind = "deck" | "video";
export type MediaFilter = "all" | MediaKind;
// Stable gallery IDs; display names are workspace data.
export type Gallery = string;
export type GallerySection = "team" | "course";
export interface GalleryDefinition {
	id: Gallery;
	name: string;
	url: string;
	section?: GallerySection;
}
export type GalleryMutation =
	| { type: "create"; name: string; url?: string; section?: "course" | null }
	| { type: "update"; id: Gallery; name: string; url: string; section?: "course" | null }
	| { type: "rename"; id: Gallery; name: string }
	| { type: "delete"; id: Gallery };
export const isFixedGallery = (id: Gallery): boolean => id === "public" || id === "none";
export type AdminView = "all" | Gallery | "featured" | "history";
export type CatalogSort = "original" | "title" | "featured";

// Matches the library's LearningItem. Retain extra fields when importing or editing.
export interface LearningItem {
	[field: string]: unknown;
	id: string;
	title: string;
	description: string;
	category?: string;
	topics?: string[];
	featured: boolean;
	unlisted?: boolean;
	gallery?: Gallery;
	poster: string;
	slides: number;
	duration: number | null;
	checkpoints: number;
	chapters: string[];
	deck: string | null;
	powerpoint: string | null;
	video: string | null;
	scorm?: Partial<Record<MediaKind, string>>;
}

export function itemTopics(
	item: Pick<LearningItem, "topics" | "category">,
	formerTeam?: string,
): string[] {
	if (item.topics) return item.topics;
	const topics = new Map<string, string>();
	for (const value of [formerTeam, item.category]) {
		const topic = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
		const key = topic.toLocaleLowerCase("he");
		if (topic && !topics.has(key)) topics.set(key, topic);
	}
	return [...topics.values()];
}

export interface CatalogDocument {
	[field: string]: unknown;
	schemaVersion: 1;
	items: LearningItem[];
	galleries: GalleryDefinition[];
}
export type CatalogInput = CatalogDocument | LearningItem[];
export type ImportMode = "merge" | "overwrite" | "replace";
export type CatalogRevision = number | string;
export interface CatalogSnapshot {
	mode?: "local" | "production";
	revision: CatalogRevision;
	updatedAt: string | null;
	items: LearningItem[];
	galleries: GalleryDefinition[];
}
export interface HistoryEntry {
	id: string;
	at: string;
	action: string;
	revision: CatalogRevision;
	count: number;
}
export interface CatalogRepository {
	load(): Promise<CatalogSnapshot>;
	save(
		items: LearningItem[],
		revision: CatalogRevision,
		action: string,
	): Promise<CatalogSnapshot>;
	importCatalog(
		catalog: CatalogInput,
		mode: ImportMode,
		revision: CatalogRevision,
	): Promise<CatalogSnapshot>;
	changeGallery(change: GalleryMutation, revision: CatalogRevision): Promise<CatalogSnapshot>;
	history(): Promise<HistoryEntry[]>;
	restore(id: string, revision: CatalogRevision): Promise<CatalogSnapshot>;
	source(): Promise<CatalogDocument>;
	dispose(): void;
}
export function itemGallery(item: Pick<LearningItem, "gallery" | "unlisted">): Gallery {
	return item.gallery ?? (item.unlisted ? "team" : "public");
}
