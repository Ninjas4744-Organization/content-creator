export type MediaKind = "deck" | "video";
export type MediaFilter = "all" | MediaKind;
export type GalleryScope = string;
export type GallerySection = "team" | "course";
export interface GalleryDefinition {
	[field: string]: unknown;
	id: string;
	name: string;
	url: string;
	section?: GallerySection;
}
export interface CatalogDocument {
	[field: string]: unknown;
	schemaVersion: 1;
	galleries: GalleryDefinition[];
	items: LearningItem[];
}
export const defaultGalleries: GalleryDefinition[] = [
	{ id: "public", name: "ספרייה ציבורית", url: "/" },
	{ id: "team", name: "ספריית הקבוצה", url: "/team-library" },
	{ id: "study", name: "למידה למבחנים", url: "/study-library" },
	{ id: "none", name: "בקישור בלבד", url: "/" },
];

export interface LearningItem {
	[field: string]: unknown;
	id: string;
	title: string;
	description: string;
	category?: string;
	topics?: string[];
	featured: boolean;
	unlisted?: boolean;
	gallery?: GalleryScope | "none";
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

export interface CatalogRepository {
	list(): Promise<CatalogDocument>;
	dispose(): void;
}

export function itemGallery(item: LearningItem): GalleryScope | "none" {
	return item.gallery ?? (item.unlisted ? "team" : "public");
}
