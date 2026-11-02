import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { SourcesDomain, initialSourceState } from "./sources-domain.mjs";
import { BackgroundStorage } from "./background-storage.mjs";
import { checkBackgroundAssets } from "./background-assets.mjs";

export class SourcesStore extends SourcesDomain {
	constructor(file, assets = new BackgroundStorage(resolve(dirname(file), "background-assets"))) {
		super({
			async read() {
				try {
					return JSON.parse(await readFile(file, "utf8"));
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
					return initialSourceState();
				}
			},
			async write(state) {
				await checkBackgroundAssets(
					state.document,
					async (file) => (await assets.read(file))?.asset ?? null,
				);
				await mkdir(dirname(file), { recursive: true });
				const temp = `${file}.${randomUUID()}.tmp`;
				try {
					await writeFile(temp, JSON.stringify(state) + "\n", {
						mode: 0o600,
						flag: "wx",
					});
					await rename(temp, file);
				} finally {
					await rm(temp, { force: true });
				}
			},
		});
	}
}
