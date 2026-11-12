import { env } from "cloudflare:test";
import { beforeEach, expect, test, vi } from "vitest";
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
const scormArchive = Uint8Array.from(
	atob(
		"UEsDBBQAAAAAAKo6Y13tN8mLCwAAAAsAAAAPAAAAaW1zbWFuaWZlc3QueG1sPG1hbmlmZXN0Lz5QSwECFAMUAAAAAACqOmNd7TfJiwsAAAALAAAADwAAAAAAAAAAAAAAgAEAAAAAaW1zbWFuaWZlc3QueG1sUEsFBgAAAAABAAEAPQAAADgAAAAAAA==",
	),
	(value) => value.charCodeAt(0),
); // ZIP with a root imsmanifest.xml entry.
const blossomSettings = {
	...settings,
	ADMIN_SSO_ISSUER: "https://davinci4744.blossom-kc.com",
	BLOSSOM_COURSE_DOMAIN_ID: "5",
	BLOSSOM_CONTENT_API_USER: "test-content",
	BLOSSOM_CONTENT_API_PASSWORD: "test-secret",
};
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

test("creator publication and replay publish SCORM to the site without calling Blossom", async () => {
	const f = await fixture();
	for (const [variant, filename] of [
		["deck", "slides.zip"],
		["video", "video.zip"],
	] as const) {
		const path = `exports/new-training/${filename}`;
		f.catalog.items[0]!.scorm = { ...f.catalog.items[0]!.scorm, [variant]: "library/" + path };
		f.files.push({ path, size: scormArchive.length, hashes: [await hash(scormArchive)] });
		f.data.push(scormArchive);
	}
	const session = await begin(f);
	await upload(session);
	const storage = new R2CatalogStorage(bucket, actor);
	const upstream = vi
		.spyOn(globalThis, "fetch")
		.mockResolvedValue(new Response(null, { status: 503 }));
	const publish = () =>
		creatorApi(
			request(`uploads/${session.id}/publish`, "POST"),
			blossomSettings,
			actor,
			storage,
		);
	try {
		const first = await (await publish()).json();
		expect(first).toMatchObject({ published: true, ids: ["new-training"] });
		expect(await (await publish()).json()).toEqual(first);
		expect(upstream).not.toHaveBeenCalled();
		const saved = (await storage.read()).items.at(-1)!;
		expect(saved.scorm).toEqual({
			deck: `library/releases/${session.id}/exports/new-training/slides.zip`,
			video: `library/releases/${session.id}/exports/new-training/video.zip`,
		});
		expect(
			await (await adminApi(request("blossom"), blossomSettings, actor, "42")).json(),
		).toEqual({
			available: true,
			items: {},
		});
		expect((await storage.history()).length).toBe(1);
	} finally {
		upstream.mockRestore();
	}
});

test("the admin uploads a saved legacy archive and projects private Blossom IDs", async () => {
	const storage = new R2CatalogStorage(bucket, actor);
	const initial = await storage.read();
	const item = initial.items[0]!;
	const path = `library/exports/${item.id}/slides.zip`;
	item.scorm = { ...item.scorm, deck: path };
	await bucket.put("library/catalog.json", JSON.stringify(documentOf(initial)));
	const before = await storage.read();
	await bucket.put(path, scormArchive);
	// Receipt written by the original integration, before custom metadata was indexed.
	await bucket.put(
		`private/blossom-content/42/davinci4744-${item.id}-video.json`,
		JSON.stringify({ leaseUntil: 0, uploaded: { fingerprint: "legacy", contentId: 96 } }),
	);
	const status = () => adminApi(request("blossom"), blossomSettings, actor, "42");
	const endpoint = `blossom/${item.id}/deck`;
	const publish = (revision: string, owner = "42") =>
		adminApi(
			request(endpoint, "POST", { owner: "99" }, revision),
			blossomSettings,
			actor,
			owner,
		);
	const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
		const form = await new Request(url, init).formData();
		const owner = form.get("user_id");
		expect(["42", "43"]).toContain(owner);
		expect(form.get("user")).toBe(`user_id=${owner}&domain=5`);
		expect(form.get("ext_id")).toBe(`davinci4744-user-${owner}-${item.id}-deck`);
		expect(new Uint8Array(await (form.get("lessonfile") as File).arrayBuffer())).toEqual(
			scormArchive,
		);
		return new Response(owner === "42" ? "97" : "98");
	});
	try {
		expect(await (await status()).json()).toMatchObject({
			available: true,
			items: { [item.id]: { video: 96 } },
		});
		await expect(publish("old")).rejects.toMatchObject({ status: 409 });
		await expect(
			adminApi(
				request(endpoint, "POST", { owner: "99" }, String(before.revision)),
				blossomSettings,
				actor,
			),
		).rejects.toMatchObject({ status: 403 });
		const agentRequest = request(endpoint, "POST", {}, String(before.revision));
		agentRequest.headers.set("Authorization", "Bearer test-grant");
		await expect(adminApi(agentRequest, blossomSettings, actor)).rejects.toMatchObject({
			status: 403,
		});
		expect(upstream).not.toHaveBeenCalled();
		for (let attempt = 0; attempt < 2; attempt++)
			expect(await (await publish(String(before.revision))).json()).toEqual({
				contentId: 97,
			});
		expect(upstream).toHaveBeenCalledTimes(1);
		expect(await (await publish(String(before.revision), "43")).json()).toEqual({
			contentId: 98,
		});
		expect(await (await status()).json()).toMatchObject({
			available: true,
			items: { [item.id]: { deck: 97, video: 96 } },
		});
		expect((await storage.read()).revision).toBe(before.revision);
	} finally {
		upstream.mockRestore();
	}
});

test("course export prepares SCORM forms and resumes without recreating courses", async () => {
	const courseId = "library-course";
	const storage = new R2CatalogStorage(bucket, actor);
	const state = await storage.read();
	const items = state.items.slice(0, 2).map((item, i) => ({
		...item,
		gallery: courseId,
		scorm: i === 0 ? { deck: "library/exports/" + item.id + "/slides.zip" } : {},
	}));
	const gallery = { id: courseId, name: "רובוטיקה", url: "/", section: "course" };
	await bucket.put(
		"library/catalog.json",
		JSON.stringify({ ...documentOf(state), galleries: [...state.galleries, gallery], items }),
	);
	const revision = String((await storage.read()).revision);
	await bucket.put(items[0]!.scorm.deck!, scormArchive);
	const legacyReceipt = "private/blossom-content/42/davinci4744-" + items[1]!.id + "-video.json";
	const courseSettings = {
		...blossomSettings,
		BLOSSOM_SYNC_API_USER: "test-sync",
		BLOSSOM_SYNC_API_PASSWORD: "test-sync-secret",
		ADMIN_PERMISSION_URL:
			"https://davinci4744.blossom-kc.com/WebServices/api_remote/user_details",
		ADMIN_PERMISSION_USER: "test-remote",
		ADMIN_PERMISSION_SECRET: "test-remote-secret",
		BLOSSOM_COURSE_DOMAIN_ID: "5",
	};
	const path = "blossom/courses/" + courseId + "/publish";
	const publish = (version = revision) =>
		adminApi(request(path, "POST", {}, version), courseSettings, actor, "42");
	const status = () =>
		adminApi(request("blossom"), courseSettings, actor, "42").then((value) => value.json());
	const forms = () =>
		adminApi(
			request(`blossom/courses/${courseId}/assignment-forms`),
			courseSettings,
			actor,
		).then((value) => value.json());
	let externalId = "";
	let courseFound = false;
	let courseName = "";
	let nameInUse = true;
	let keepWorkspaceNames = false;
	const operations: string[] = [];
	const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
		const outgoing = new Request(url, init);
		if (outgoing.headers.get("Content-Type")?.startsWith("multipart/form-data")) {
			const form = await outgoing.formData();
			expect(form.get("user")).toBe("user_id=42&domain=5");
			expect(form.get("ext_id")).toBe("davinci4744-user-42-" + items[0]!.id + "-deck");
			operations.push("upload");
			return Response.json({ res: "success", content_id: "97", share_id: null });
		}
		if (outgoing.url.endsWith("/sync_2/ImportGroups/5")) {
			expect(outgoing.headers.get("Authorization")).toBe(
				"Basic " + btoa("test-sync:test-sync-secret"),
			);
			expect(await outgoing.json()).toEqual([
				{ name: gallery.name, external_id: externalId, type: "course" },
			]);
			operations.push("import-name");
			courseName = gallery.name;
			return Response.json({ res: "success", results: [] });
		}
		const body = await outgoing.json<{
			domain?: string;
			details?: { name: string; external_id: string; type: string };
			filters?: { external_id: string; type: string; limit: number };
			as_array?: boolean;
		}>();
		expect(body.domain).toBe("5");
		if (outgoing.url.endsWith("/api_remote/groups")) {
			expect(outgoing.headers.get("Authorization")).toBe(
				"Basic " + btoa("test-remote:test-remote-secret"),
			);
			expect(body).toMatchObject({ filters: { type: "course", limit: 2 }, as_array: true });
			expect(body.filters?.external_id).toMatch(/^davinci4744-course-[a-f0-9]{32}$/);
			operations.push("lookup");
			return Response.json(
				courseFound
					? [
							{
								group_id: "98",
								external_id: externalId,
								type: "Course",
								group_name: courseName,
							},
						]
					: [],
			);
		}
		expect(outgoing.url).toBe(
			"https://davinci4744.blossom-kc.com/WebServices/sync_2/UpdateGroup",
		);
		expect(outgoing.headers.get("Authorization")).toBe(
			"Basic " + btoa("test-sync:test-sync-secret"),
		);
		expect(body.details?.type).toBe("course");
		expect(body.details?.external_id).toMatch(/^davinci4744-course-[a-f0-9]{32}$/);
		if (courseName) {
			expect(body.details?.external_id).toBe(externalId);
			expect(body.details?.name).toBe(gallery.name);
			if (nameInUse) {
				operations.push("rename-conflict");
				return Response.json(
					{
						res: "error",
						error_msg: "group_name validation error: In conflict with: #99",
					},
					{ status: 500 },
				);
			}
			operations.push("rename");
		} else {
			expect(body.details?.name).toMatch(/^Da Vinci setup [a-f0-9-]{36}$/);
			externalId = body.details!.external_id;
			operations.push("create");
		}
		if (!keepWorkspaceNames) courseName = body.details!.name;
		return Response.json({ res: "success" });
	});
	try {
		await expect(publish("stale")).rejects.toMatchObject({ status: 409 });
		await expect(publish()).rejects.toMatchObject({ status: 422 });
		const agent = request(path, "POST", {}, revision);
		agent.headers.set("Authorization", "Bearer test-grant");
		await expect(adminApi(agent, courseSettings, actor)).rejects.toMatchObject({ status: 403 });
		await expect(
			adminApi(
				request(path, "POST", {}, revision, "https://example.org"),
				courseSettings,
				actor,
			),
		).rejects.toMatchObject({ status: 403 });
		expect(upstream).not.toHaveBeenCalled();

		await bucket.put(
			legacyReceipt,
			JSON.stringify({ leaseUntil: 0, uploaded: { contentId: 96 } }),
		);
		await expect(publish()).rejects.toMatchObject({ status: 502 });
		expect(await status()).toMatchObject({
			courses: { [courseId]: { externalId, lessonCount: 2, assignmentCount: 0 } },
		});
		await expect(forms()).rejects.toMatchObject({ status: 404 });

		courseFound = true;
		await expect(publish()).rejects.toMatchObject({ status: 409 });
		await expect(forms()).rejects.toMatchObject({ status: 404 });
		nameInUse = false;
		const workspaceUrl = "https://davinci4744.blossom-kc.com/#workspace/98";
		const formUrl = (contentId: number) =>
			`https://davinci4744.blossom-kc.com/#edit/assignment/type=courseware&content=${contentId}&ws=98`;
		for (let attempt = 0; attempt < 2; attempt++)
			expect(await (await publish()).json()).toMatchObject({
				name: gallery.name,
				externalId,
				lessonCount: 2,
				assignmentCount: 0,
				workspaceUrl,
			});
		expect(operations).toEqual([
			"upload",
			"lookup",
			"create",
			"lookup",
			"lookup",
			"rename-conflict",
			"lookup",
			"rename",
			"lookup",
		]);
		expect(await status()).toMatchObject({
			courses: { [courseId]: { name: gallery.name, workspaceUrl } },
		});
		expect(await forms()).toEqual([
			{ title: items[0]!.title, url: formUrl(97) },
			{ title: items[1]!.title, url: formUrl(96) },
		]);

		const name = gallery.name;
		const legacyName =
			name +
			" · DV-" +
			externalId.slice("davinci4744-course-".length, "davinci4744-course-".length + 12);
		courseName = legacyName;
		keepWorkspaceNames = true;
		await bucket.put(
			"private/blossom-courses/5/" + courseId + ".json",
			JSON.stringify({
				leaseUntil: 0,
				contentEnabled: true,
				sharedCount: 2,
				groupId: 98,
				plan: {
					name: legacyName,
					externalId,
					lessons: [{ contentId: 97 }, { contentId: 96 }],
				},
			}),
			{
				customMetadata: {
					name: legacyName,
					externalId,
					groupId: "98",
					lessonCount: "2",
					sharedCount: "2",
				},
			},
		);
		expect(await status()).toMatchObject({
			courses: { [courseId]: { name: legacyName, assignmentCount: 0 } },
		});
		expect(await (await publish()).json()).toMatchObject({ name, externalId, workspaceUrl });
		expect(await forms()).toEqual([
			{ title: "שיעור 1", url: formUrl(97) },
			{ title: "שיעור 2", url: formUrl(96) },
		]);
		expect(operations.slice(9)).toEqual([
			"lookup",
			"rename",
			"lookup",
			"import-name",
			"lookup",
		]);
		expect((await storage.read()).revision).toBe(revision);
	} finally {
		upstream.mockRestore();
	}
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
