import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest({
			remoteBindings: false,
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
	],
	test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
});
