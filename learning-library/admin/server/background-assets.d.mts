import type { BackgroundAsset, ContentBackground, SourceDocument } from "../src/models/sources";
export const maxBackgroundBytes: number;
export const backgroundFilePattern: RegExp;
export const defaultBackgrounds: ContentBackground[];
export function validateBackgroundAsset(value: unknown): BackgroundAsset;
export function inspectBackgroundImage(
	bytes: Uint8Array,
	contentType: string,
): Promise<BackgroundAsset>;
export function seedAsset(file: string): BackgroundAsset | undefined;
export function checkBackgroundAssets(
	document: SourceDocument,
	read: (file: string) => Promise<BackgroundAsset | null>,
): Promise<void>;
