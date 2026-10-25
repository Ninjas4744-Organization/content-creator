export type MediaKind = "deck" | "video";
export type MediaFilter = "all" | MediaKind;

export interface LearningItem {
	id: string;
	title: string;
	description: string;
	category: string;
	featured: boolean;
	poster: string;
	slides: number;
	duration: number | null;
	checkpoints: number;
	chapters: string[];
	deck: string | null;
	powerpoint: string | null;
	video: string | null;
}

export interface CatalogRepository {
	list(): Promise<LearningItem[]>;
	dispose(): void;
}
