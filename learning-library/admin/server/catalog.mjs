import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { CatalogDomain, stateFromDocument } from "./catalog-domain.mjs";
export * from "./catalog-domain.mjs";

export class CatalogStore extends CatalogDomain {
	constructor(file, seed) {
		super({
			async read() {
				try {
					return JSON.parse(await readFile(file, "utf8"));
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
					return stateFromDocument(JSON.parse(await readFile(seed, "utf8")));
				}
			},
			async write(state) {
				await mkdir(dirname(file), { recursive: true });
				const temp = `${file}.${randomUUID()}.tmp`;
				try {
					await writeFile(temp, JSON.stringify(state, null, 2) + "\n", {
						mode: 0o600,
						flag: "wx",
					});
					await rename(temp, file);
				} finally {
					await rm(temp, { force: true });
				}
			},
		});
		this.file = file;
		this.seed = seed;
	}
}
