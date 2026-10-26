import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: {
					TEST_MIGRATIONS: await readD1Migrations("./migrations"),
					PLATFORM_ISSUER: "https://platform.example/lms",
				},
			},
		}),
	],
	test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
});
