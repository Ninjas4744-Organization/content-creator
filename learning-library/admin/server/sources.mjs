import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { SourcesDomain, initialSourceState } from "./sources-domain.mjs";

export class SourcesStore extends SourcesDomain {
	constructor(file) {
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
