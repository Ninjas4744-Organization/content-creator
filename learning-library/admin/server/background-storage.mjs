import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogError } from "./catalog-domain.mjs";
import { backgroundFilePattern, inspectBackgroundImage, seedAsset } from "./background-assets.mjs";

const seeds = fileURLToPath(new URL("../public/source-backgrounds/", import.meta.url));
export class BackgroundStorage {
	constructor(directory) {
		this.directory = directory;
	}
	async read(file) {
		if (!backgroundFilePattern.test(file)) throw new CatalogError("תמונת הרקע לא נמצאה.", 404);
		let data;
		try {
			data = await readFile(resolve(seedAsset(file) ? seeds : this.directory, file));
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
			return null;
		}
		const asset = await inspectBackgroundImage(
			data,
			file.endsWith(".png") ? "image/png" : "image/jpeg",
		);
		if (asset.file !== file) throw new CatalogError("תמונת הרקע השתנתה.");
		return { data, asset };
	}
	async upload(data, contentType) {
		const asset = await inspectBackgroundImage(data, contentType);
		await mkdir(this.directory, { recursive: true });
		try {
			await writeFile(resolve(this.directory, asset.file), data, { flag: "wx", mode: 0o600 });
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			await this.read(asset.file);
		}
		return asset;
	}
}
