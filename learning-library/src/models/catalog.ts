export type MediaKind = "deck" | "video";
export type MediaFilter = "all" | MediaKind;
export type GalleryScope = string;
export interface GalleryDefinition {
	[field: string]: unknown;
	id: string;
	name: string;
	url: string;
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
	category: string;
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

export interface CatalogRepository {
	list(): Promise<CatalogDocument>;
	dispose(): void;
}

export function itemGallery(item: LearningItem): GalleryScope | "none" {
	return item.gallery ?? (item.unlisted ? "team" : "public");
}
