export type MediaKind = "deck" | "video";
export type MediaFilter = "all" | MediaKind;
export type GalleryScope = "public" | "team";

export interface LearningItem {
	id: string;
	title: string;
	description: string;
	category: string;
	featured: boolean;
	unlisted?: boolean;
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
	list(): Promise<LearningItem[]>;
	dispose(): void;
}
