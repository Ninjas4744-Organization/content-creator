import type { CatalogRevision } from "./catalog";

export interface PhotoAlbum {
	[field: string]: unknown;
	id: string;
	title: string;
	url: string;
	context: string;
	tags: string[];
	enabled: boolean;
}
export interface SourceDocument {
	[field: string]: unknown;
	version: 1;
	albums: PhotoAlbum[];
	backgrounds: ContentBackground[];
}
export interface BackgroundAsset {
	file: string;
	sha256: string;
	contentType: "image/png" | "image/jpeg";
	size: number;
	width: number;
	height: number;
}
export interface ContentBackground {
	[field: string]: unknown;
	id: string;
	name: string;
	description: string;
	image: BackgroundAsset;
	coverImage?: BackgroundAsset;
	enabled: boolean;
}
export type BackgroundInput = Pick<
	ContentBackground,
	"name" | "description" | "image" | "coverImage" | "enabled"
>;
export interface SourceSnapshot extends SourceDocument {
	revision: CatalogRevision;
	updatedAt: string | null;
	mode: "local" | "production";
}
export interface SourceHistoryEntry {
	id: string;
	at: string;
	action: string;
	count: number;
	backgroundCount: number;
}
export type AlbumInput = Pick<PhotoAlbum, "id" | "title" | "url" | "context" | "tags" | "enabled">;
export type SourceMutation =
	| { type: "create"; album: Omit<AlbumInput, "id"> & { id?: string } }
	| { type: "update"; album: AlbumInput }
	| { type: "delete"; id: string }
	| { type: "create-background"; background: BackgroundInput }
	| { type: "update-background"; background: BackgroundInput & { id: string } }
	| { type: "delete-background"; id: string }
	| { type: "restore"; id: string };
export interface SourcesRepository {
	load(): Promise<SourceSnapshot>;
	change(input: SourceMutation, revision: CatalogRevision): Promise<SourceSnapshot>;
	history(): Promise<SourceHistoryEntry[]>;
	uploadBackground(data: ArrayBuffer, contentType: string): Promise<BackgroundAsset>;
	dispose(): void;
}
