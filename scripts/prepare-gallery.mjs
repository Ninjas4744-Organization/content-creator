// Website builds contain the application and brand assets, never local lessons.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(root, "learning-library/public/library");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
if (process.env.LIBRARY_PREVIEW_DIR) {
	cpSync(resolve(process.env.LIBRARY_PREVIEW_DIR), target, { recursive: true });
} else {
	writeFileSync(
		resolve(target, "catalog.json"),
		JSON.stringify(
			{
				schemaVersion: 1,
				galleries: [
					{ id: "public", name: "ספרייה ציבורית", url: "/" },
					{ id: "team", name: "ספריית הקבוצה", url: "/team-library" },
					{ id: "study", name: "למידה למבחנים", url: "/study-library" },
					{ id: "none", name: "בקישור בלבד", url: "/" },
				],
				items: [],
			},
			null,
			2,
		) + "\n",
	);
}
const brand = resolve(target, "brand");
mkdirSync(brand, { recursive: true });
for (const name of [
	"logo.png",
	"wordmark.png",
	"space-hero.png",
	"Rubik-Regular.ttf",
	"Rubik-Bold.ttf",
	"Rubik-OFL.txt",
])
	cpSync(resolve(root, "assets/brand", name), resolve(brand, name));
