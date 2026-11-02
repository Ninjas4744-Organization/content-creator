import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
// Synchronized into the deployment Worker test suite by sync:deployment.
import { adminApi } from "../src/admin";
import worker from "../src/worker";
import type { Env } from "../src/model";
import { R2SourcesStorage } from "../../admin/worker/sources";
import { SourcesDomain } from "../../admin/server/sources-domain.mjs";
import type { SourceSnapshot } from "../../admin/src/models/sources";
import { backgroundPng } from "../../admin/tests/background-fixture";
import type { BackgroundAsset } from "../../admin/src/models/sources";

const settings = {
	...env,
	ADMIN_ACCESS_ISSUER: "https://test-admin.cloudflareaccess.com",
	ADMIN_ACCESS_AUD: "test",
	ADMIN_EMAILS: "allowed@example.com",
} as unknown as Env;
const origin = "https://knowledge.davinci4744.com";
const actor = "allowed@example.com";
const key = "private/admin-sources/photo-albums.json";
const album = {
	id: "team-work",
	title: "עבודת צוות",
	url: "https://photos.app.goo.gl/abc",
	context: "בניית רובוט",
	tags: ["צוות"],
	enabled: true,
};
function request(path: string, input?: unknown, revision = "0", site = origin) {
	return new Request(
		origin + "/admin/api/" + path,
		input === undefined
			? {}
			: {
					method: "POST",
					headers: {
						Origin: site,
						"Content-Type": "application/json",
						"If-Match": revision,
					},
					body: JSON.stringify(input),
				},
	);
}
const call = (path = "sources", input?: unknown, revision = "0") =>
	adminApi(request(path, input, revision), settings, actor);
beforeEach(async () => {
	await settings.CONTENT.delete(key);
});

test("R2 source creation is conditional across requests and preserves recoverable history", async () => {
	const initial = await (await call()).json<SourceSnapshot>();
	expect(initial.albums).toHaveLength(3);
	expect(initial.revision).toBe(0);
	const results = await Promise.allSettled([
		call("sources", { type: "create", album }),
		call("sources", { type: "create", album: { ...album, id: "another" } }),
	]);
	expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	const rejected = results.find(
		(result) => result.status === "rejected",
	) as PromiseRejectedResult;
	expect(rejected.reason.status).toBe(409);
	const current = await (await call()).json<SourceSnapshot>();
	expect(current.albums).toHaveLength(4);
	expect(current.revision).not.toBe(0);
	const history = await (
		await call("sources/history")
	).json<{ history: { id: string; document?: unknown }[] }>();
	expect(history.history).toHaveLength(1);
	expect(history.history[0]!.document).toBeUndefined();
	const restored = await (
		await call(
			"sources",
			{ type: "restore", id: history.history[0]!.id },
			String(current.revision),
		)
	).json<SourceSnapshot>();
	expect(restored.albums).toEqual(initial.albums);
	const stored = await settings.CONTENT.get(key);
	expect(stored!.httpMetadata?.cacheControl).toBe("no-store");
	expect((await stored!.json<{ history: unknown[] }>()).history).toHaveLength(2);
	await expect(
		call("sources", { type: "delete", id: album.id }, String(current.revision)),
	).rejects.toMatchObject({ status: 409 });
});

test("creator source reads exclude disabled albums; API validates URLs and origins without exposing private storage", async () => {
	const created = await (
		await call("sources", { type: "create", album: { ...album, enabled: false } })
	).json<SourceSnapshot>();
	const sources = await (await call("creator/source-library")).json<SourceSnapshot>();
	expect(sources.albums).toHaveLength(3);
	expect(sources.albums.some((entry) => entry.id === album.id)).toBe(false);
	await expect(
		call(
			"sources",
			{ type: "create", album: { ...album, url: "https://evil.example" } },
			String(created.revision),
		),
	).rejects.toMatchObject({ status: 400 });
	await expect(
		adminApi(
			request(
				"sources",
				{ type: "delete", id: album.id },
				String(created.revision),
				"https://evil.example",
			),
			settings,
			actor,
		),
	).rejects.toMatchObject({ status: 403 });
	const unauthenticated = await worker.fetch(request("sources"), settings);
	expect([401, 403]).toContain(unauthenticated.status);
	const publicRead = await worker.fetch(new Request(origin + "/" + key), settings);
	expect(publicRead.status).toBe(404);
	const storage = new R2SourcesStorage(settings.CONTENT, actor);
	const store = new SourcesDomain(storage);
	const before = await store.read();
	before.document.future = { retained: true };
	before.document.albums[0]!.credit = "team";
	const written = await storage.write(before, before);
	const updated = await store.change(String(written.revision), {
		type: "update",
		album: { ...before.document.albums[0]!, context: "הקשר חדש" },
	});
	expect(updated.document.future).toEqual({ retained: true });
	expect(updated.document.albums[0]!.credit).toBe("team");
});

test("background uploads are immutable and private, and saves validate their stored metadata", async () => {
	const upload = () =>
		adminApi(
			new Request(origin + "/admin/api/sources/background-assets", {
				method: "POST",
				headers: { Origin: origin, "Content-Type": "image/png" },
				body: backgroundPng,
			}),
			settings,
			actor,
		);
	const response = await upload();
	expect(response.status).toBe(201);
	const image = await response.json<BackgroundAsset>();
	expect(await (await upload()).json()).toEqual(image);
	const current = await (await call()).json<SourceSnapshot>();
	const created = await (
		await call(
			"sources",
			{
				type: "create-background",
				background: {
					name: "הכשרת צוות",
					description: "רקע מתאים להכשרה",
					image,
					enabled: true,
				},
			},
			String(current.revision),
		)
	).json<SourceSnapshot>();
	expect(created.backgrounds).toHaveLength(2);
	const preview = await call("creator/background-assets/" + image.file);
	expect(preview.headers.get("Content-Type")).toBe("image/png");
	expect(new Uint8Array(await preview.arrayBuffer())).toEqual(backgroundPng);
	await expect(
		call(
			"sources",
			{
				type: "create-background",
				background: {
					name: "זיוף",
					description: "לא קיים",
					image: { ...image, size: image.size + 1 },
					enabled: true,
				},
			},
			String(created.revision),
		),
	).rejects.toMatchObject({ status: 400 });
	const publicRead = await worker.fetch(
		new Request(origin + "/private/admin-sources/background-assets/" + image.file),
		settings,
	);
	expect(publicRead.status).toBe(404);
	const seeded = await call("creator/background-assets/" + current.backgrounds[0]!.image.file);
	expect(seeded.status).toBe(200);
	expect((await seeded.arrayBuffer()).byteLength).toBe(current.backgrounds[0]!.image.size);
});
