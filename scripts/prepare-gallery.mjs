import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const localPython = resolve(
	root,
	process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python",
);
const python = existsSync(localPython)
	? localPython
	: process.platform === "win32"
		? "python"
		: "python3";
const result = spawnSync(
	python,
	[resolve(root, "scripts/prepare_gallery.py"), ...process.argv.slice(2)],
	{ cwd: root, stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
