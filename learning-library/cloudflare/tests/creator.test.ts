import { env } from "cloudflare:test";
import { beforeEach, expect, test } from "vitest";
// Synchronized into learning-library/cloudflare/tests, where the Worker runtime lives.
import { adminApi } from "../src/admin";
import worker from "../src/worker";
import { R2CatalogStorage } from "../src/admin-storage";
import type { Env } from "../src/model";
import { creatorApi } from "../../admin/worker/creator";
import { documentOf, stateFromDocument } from "../../admin/server/catalog-domain.mjs";
import seed from "../../admin/fixtures/catalog.json";

const settings = {
	...env,
	ADMIN_ACCESS_ISSUER: "https://test-admin.cloudflareaccess.com",
	ADMIN_ACCESS_AUD: "admin-audience",
	ADMIN_EMAILS: "allowed@example.com",
} as unknown as Env;
const origin = "https://knowledge.davinci4744.com";
const actor = "allowed@example.com";
const bucket = settings.CONTENT;
const encode = (value: string) => new TextEncoder().encode(value);
async function hash(data: Uint8Array) {
	return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
		.map((n) => n.toString(16).padStart(2, "0"))
		.join("");
}
function request(
	path: string,
	method = "GET",
	input?: unknown,
	revision?: string,
	originHeader = origin,
) {
	const binary = input instanceof Uint8Array;
	return new Request(origin + "/admin/api/creator/" + path, {
		method,
		headers: {
			Origin: originHeader,
			...(input === undefined
				? {}
				: { "Content-Type": binary ? "application/octet-stream" : "application/json" }),
			...(revision ? { "If-Match": revision } : {}),
		},
		...(input === undefined ? {} : { body: binary ? input : JSON.stringify(input) }),
	});
}
const call = (path: string, method = "GET", input?: unknown, revision?: string, email = actor) =>
	creatorApi(
		request(path, method, input, revision),
		settings,
		email,
		new R2CatalogStorage(bucket, email),
	);
async function fixture() {
	const state = await new R2CatalogStorage(bucket, actor).read();
	const item = {
		...state.items[0]!,
		title: "Package title",
		poster: "library/media/new-training/poster.jpg",
		id: "new-training",
		deck: "library/media/new-training/deck.html",
		video: null,
		powerpoint: null,
		scorm: {},
		gallery: "none",
	};
	const data = [
		encode("poster"),
		encode("<html>New lesson</html>"),
		encode("private editable sources"),
	];
	const paths = [
		"media/new-training/poster.jpg",
		"media/new-training/deck.html",
		"sources/new-training.zip",
	];
	const files = await Promise.all(
		paths.map(async (path, i) => ({
			path,
			size: data[i]!.length,
			hashes: [await hash(data[i]!)],
		})),
	);
	return {
		state,
		data,
		files,
		catalog: { schemaVersion: 1, galleries: state.galleries, items: [item] },
	};
}
async function begin(input?: Awaited<ReturnType<typeof fixture>>) {
	const f = input ?? (await fixture());
	const response = await call(
		"uploads",
		"POST",
		{ catalog: f.catalog, files: f.files },
		String(f.state.revision),
	);
	expect(response.status).toBe(201);
	const session = await response.json<{ id: string }>();
	return { ...f, id: session.id };
}
async function upload(f: Awaited<ReturnType<typeof begin>>) {
	for (let i = 0; i < f.files.length; i++) {
		const path = `uploads/${f.id}/files/${i}`;
		expect((await call(path, "POST")).status).toBe(200);
		const part = await (await call(path + "/parts/1", "PUT", f.data[i])).json();
		expect((await call(path + "/complete", "POST", { parts: [part] })).status).toBe(200);
	}
}
beforeEach(async () => {
	let cursor: string | undefined;
	do {
		const list = await bucket.list({ cursor });
		if (list.objects.length) await bucket.delete(list.objects.map((entry) => entry.key));
		cursor = list.truncated ? list.cursor : undefined;
	} while (cursor);
	await bucket.put("library/catalog.json", JSON.stringify(seed));
});

test("the protected download serves the actual versioned creator kit", async () => {
	const response = await call("kit");
	expect(response.status).toBe(200);
	expect(response.headers.get("Content-Disposition")).toContain("davinci-creator.zip");
	const data = new Uint8Array(await response.arrayBuffer());
	const info = await (await call("kit-manifest")).json<{ size: number; sha256: string }>();
	expect(data.length).toBe(info.size);
	expect(await hash(data)).toBe(info.sha256);
});

test("verified uploads become visible only when complete and retain private source/history", async () => {
	const f = await begin();
	await expect(call(`uploads/${f.id}/publish`, "POST")).rejects.toMatchObject({ status: 409 });
	await upload(f);
	const response = await call(`uploads/${f.id}/publish`, "POST");
	expect(await response.json()).toMatchObject({ published: true, ids: ["new-training"] });
	const saved = await new R2CatalogStorage(bucket, actor).read();
	expect(saved.items.slice(0, -1)).toEqual(f.state.items);
	expect(saved.galleries).toEqual(f.state.galleries);
	expect(saved.items.at(-1)?.poster).toBe(
		`library/releases/${f.id}/media/new-training/poster.jpg`,
	);
	expect((await new R2CatalogStorage(bucket, actor).history()).length).toBe(1);
	expect(new Uint8Array(await (await call("sources/new-training")).arrayBuffer())).toEqual(
		f.data[2],
	);
	const publicSource = await worker.fetch(
		new Request(origin + `/library/creator-sources/${f.id}/new-training.zip`),
		settings,
	);
	expect(publicSource.status).toBe(404);
	await publicSource.text();
	const retry = await call(`uploads/${f.id}/publish`, "POST");
	expect(retry.status).toBe(200);
	expect((await new R2CatalogStorage(bucket, actor).history()).length).toBe(1);
	expect(
		await (await call(`uploads/${f.id}/files/0/parts/1`, "PUT", encode("overwrite"))).json(),
	).toEqual({ complete: true });
	expect(await (await bucket.get(saved.items.at(-1)!.poster))!.text()).toBe("poster");
});

test("ownership, authentication, origin and current catalog revision guard uploads", async () => {
	const f = await begin();
	await expect(
		call(`uploads/${f.id}/files/0`, "POST", undefined, undefined, "another@example.com"),
	).rejects.toMatchObject({ status: 403 });
	await expect(
		adminApi(
			request("uploads", "POST", {}, String(f.state.revision), "https://evil.example"),
			settings,
			actor,
		),
	).rejects.toMatchObject({ status: 403 });
	const unauthenticated = await worker.fetch(request("uploads", "POST", {}), settings);
	expect(unauthenticated.status).toBe(401);
	await unauthenticated.text();
	await bucket.put(
		"library/catalog.json",
		JSON.stringify({
			...documentOf(stateFromDocument(seed)),
			items: f.state.items.map((item, i) =>
				i === 0 ? { ...item, title: "Concurrent editorial change" } : item,
			),
		}),
	);
	await expect(
		call("uploads", "POST", { catalog: f.catalog, files: f.files }, String(f.state.revision)),
	).rejects.toMatchObject({ status: 409 });
	await upload(f);
	await expect(call(`uploads/${f.id}/publish`, "POST")).rejects.toMatchObject({ status: 409 });
	expect((await new R2CatalogStorage(bucket, actor).read()).items[0]?.title).toBe(
		"Concurrent editorial change",
	);
});

test("invalid paths, incomplete manifests and tampered chunks never publish", async () => {
	const f = await fixture();
	for (const path of [
		"../catalog.json",
		"media/other/poster.jpg",
		"media/new-training/.secret.txt",
		"media/new-training/poster.exe",
	]) {
		await expect(
			call(
				"uploads",
				"POST",
				{ catalog: f.catalog, files: [{ ...f.files[0], path }, ...f.files.slice(1)] },
				String(f.state.revision),
			),
		).rejects.toMatchObject({ status: 400 });
	}
	await expect(
		call(
			"uploads",
			"POST",
			{ catalog: f.catalog, files: f.files.slice(0, 2) },
			String(f.state.revision),
		),
	).rejects.toMatchObject({ status: 400 });
	const session = await begin(f);
	const path = `uploads/${session.id}/files/0`;
	await call(path, "POST");
	await expect(call(path + "/parts/1", "PUT", encode("forged"))).rejects.toMatchObject({
		status: 400,
	});
	await expect(call(path + "/parts/2", "PUT", encode("bad"))).rejects.toMatchObject({
		status: 400,
	});
	expect((await new R2CatalogStorage(bucket, actor).read()).items).toEqual(f.state.items);
});

test("multipart video upload checks each chunk and supports reconnecting between parts", async () => {
	const f = await fixture();
	const first = new Uint8Array(8 * 1024 * 1024).fill(42),
		last = encode("last chunk");
	f.files.push({
		path: "media/new-training/video.mp4",
		size: first.length + last.length,
		hashes: [await hash(first), await hash(last)],
	});
	const session = await begin(f);
	const path = `uploads/${session.id}/files/3`;
	await call(path, "POST");
	const one = await (await call(path + "/parts/1", "PUT", first)).json();
	await call(path, "POST"); // Resume the same R2 multipart upload.
	const two = await (await call(path + "/parts/2", "PUT", last)).json();
	await call(path + "/complete", "POST", { parts: [one, two] });
	const object = await bucket.get(`library/releases/${session.id}/media/new-training/video.mp4`);
	expect(object?.size).toBe(first.length + last.length);
	expect(new Uint8Array(await object!.arrayBuffer()).slice(-last.length)).toEqual(last);
});

test("republishing preserves editorial and unknown metadata and can restore legacy sources", async () => {
	const f = await fixture();
	const existing = {
		...f.catalog.items[0]!,
		title: "Admin title",
		gallery: "team",
		custom: { keep: true },
	};
	await bucket.put(
		"library/catalog.json",
		JSON.stringify({
			schemaVersion: 1,
			galleries: f.state.galleries,
			items: [existing],
			future: { keep: true },
		}),
	);
	f.state = await new R2CatalogStorage(bucket, actor).read();
	const checksum = "a".repeat(64),
		sourceKey = `project-sources/new-training/${checksum}.zip`;
	await bucket.put(
		"project-sources/catalog.json",
		JSON.stringify({ projects: { "new-training": { sha256: checksum, key: sourceKey } } }),
	);
	await bucket.put(sourceKey, "legacy sources");
	expect(new TextDecoder().decode(await (await call("sources/new-training")).arrayBuffer())).toBe(
		"legacy sources",
	);
	const session = await begin(f);
	await upload(session);
	await call(`uploads/${session.id}/publish`, "POST");
	const saved = await new R2CatalogStorage(bucket, actor).read();
	expect(saved.items[0]).toMatchObject({
		title: "Admin title",
		gallery: "team",
		custom: { keep: true },
	});
	expect(saved.catalogMetadata.future).toEqual({ keep: true });
});
