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
}
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
}
export type AlbumInput = Pick<PhotoAlbum, "id" | "title" | "url" | "context" | "tags" | "enabled">;
export type SourceMutation =
	| { type: "create"; album: Omit<AlbumInput, "id"> & { id?: string } }
	| { type: "update"; album: AlbumInput }
	| { type: "delete"; id: string }
	| { type: "restore"; id: string };
export interface SourcesRepository {
	load(): Promise<SourceSnapshot>;
	change(input: SourceMutation, revision: CatalogRevision): Promise<SourceSnapshot>;
	history(): Promise<SourceHistoryEntry[]>;
	dispose(): void;
}
