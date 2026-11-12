import { CatalogError, galleryOf, type CatalogDomain } from "../server/catalog-domain.mjs";
import type { BlossomAssignmentForm, BlossomCourse, MediaKind } from "../src/models/catalog";
import { permissionAuthorization, type PermissionEnv } from "./permissions";
import {
	blossomApiUrl,
	blossomBasicAuth,
	blossomCatalog,
	blossomContentSettings,
	blossomId,
	blossomItemId,
	blossomOrigin,
	readBlossomResponse,
	scormPath,
	uploadExistingScorm,
	type BlossomEnv,
	type BlossomTransport,
} from "./blossom";

export interface BlossomCourseEnv
	extends
		BlossomEnv,
		Pick<
			PermissionEnv,
			| "ADMIN_PERMISSION_URL"
			| "ADMIN_PERMISSION_AUTH"
			| "ADMIN_PERMISSION_USER"
			| "ADMIN_PERMISSION_SECRET"
		> {
	BLOSSOM_SYNC_API_USER?: string;
	BLOSSOM_SYNC_API_PASSWORD?: string;
	BLOSSOM_REMOTE_API_USER?: string;
	BLOSSOM_REMOTE_API_PASSWORD?: string;
}

interface Lesson {
	contentId: number;
	title?: string;
}

interface CoursePlan {
	name: string;
	externalId: string;
	draftName?: string;
	lessons: Lesson[];
}

interface CourseReceipt {
	leaseUntil: number;
	plan?: CoursePlan;
	created?: boolean;
	contentEnabled?: boolean;
	groupId?: number;
	assignmentCount: number;
}

function remoteAuthorization(env: BlossomCourseEnv) {
	const explicit = blossomBasicAuth(env.BLOSSOM_REMOTE_API_USER, env.BLOSSOM_REMOTE_API_PASSWORD);
	if (explicit) return async () => explicit;
	if (env.BLOSSOM_REMOTE_API_USER || env.BLOSSOM_REMOTE_API_PASSWORD) return;
	const {
		ADMIN_PERMISSION_URL: url,
		ADMIN_PERMISSION_AUTH: auth = "basic",
		ADMIN_PERMISSION_USER: user,
		ADMIN_PERMISSION_SECRET: secret,
	} = env;
	if (
		url === blossomApiUrl("api_remote/user_details") &&
		user &&
		!user.includes(":") &&
		secret &&
		(auth === "basic" || (auth === "jwt" && new TextEncoder().encode(secret).length >= 32))
	)
		return () => permissionAuthorization({ auth, user, secret });
}

function courseSettings(env: BlossomCourseEnv, owner?: string) {
	const content = blossomContentSettings(env, owner);
	const sync = blossomBasicAuth(env.BLOSSOM_SYNC_API_USER, env.BLOSSOM_SYNC_API_PASSWORD);
	const remote = remoteAuthorization(env);
	return content && sync && remote ? { sync, remote, domain: content.domain } : null;
}

const prefix = (domain: string) => "private/blossom-courses/" + domain + "/";
const receiptKey = (domain: string, id: string) => prefix(domain) + id + ".json";

function legacyCourseName({ name, externalId }: CoursePlan) {
	const hash = /^davinci4744-course-([a-f0-9]{32})$/.exec(externalId)?.[1];
	if (!hash) return;
	const suffix = " · DV-" + hash.slice(0, 12);
	if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
}

function blossomPage(hash: string, transport?: BlossomTransport) {
	return (transport ? transport.baseUrl + "/?vendev" : blossomOrigin + "/") + "#" + hash;
}

function courseStatus(
	plan: CoursePlan,
	receipt: CourseReceipt,
	transport?: BlossomTransport,
): BlossomCourse {
	return {
		name: plan.name,
		externalId: plan.externalId,
		lessonCount: plan.lessons.length,
		assignmentCount: receipt.assignmentCount,
		workspaceUrl: receipt.groupId
			? blossomPage("workspace/" + receipt.groupId, transport)
			: undefined,
	};
}

export async function blossomCourses(env: BlossomCourseEnv, store: CatalogDomain, owner?: string) {
	const config = courseSettings(env, owner);
	if (!config) return;
	return listBlossomCourses(env.CONTENT, store, config.domain);
}

export async function listBlossomCourses(
	bucket: R2Bucket,
	store: CatalogDomain,
	domain: string,
	transport?: BlossomTransport,
) {
	const ids = new Set(
		(await store.read()).galleries
			.filter(({ section }) => section === "course")
			.map(({ id }) => id),
	);
	const courses: Record<string, BlossomCourse> = Object.create(null);
	if (!ids.size) return courses;
	const path = prefix(domain);
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix: path, cursor, include: ["customMetadata"] });
		for (const { key, customMetadata: metadata } of page.objects) {
			const id = key.slice(path.length, -5);
			if (ids.has(id) && metadata?.name && metadata.externalId) {
				const groupId = blossomId(metadata.groupId);
				courses[id] = {
					name: metadata.name,
					externalId: metadata.externalId,
					lessonCount: Number(metadata.lessonCount),
					assignmentCount: Number(metadata.assignmentCount ?? 0),
					workspaceUrl: groupId
						? blossomPage("workspace/" + groupId, transport)
						: undefined,
				};
			}
		}
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
	return courses;
}

export async function blossomAssignmentForms(
	bucket: R2Bucket,
	store: CatalogDomain,
	domain: string,
	id: string,
	transport?: BlossomTransport,
): Promise<BlossomAssignmentForm[]> {
	if (
		!(await store.read()).galleries.some(
			(entry) => entry.id === id && entry.section === "course",
		)
	)
		throw new CatalogError("הקורס לא נמצא.", 404);
	const receipt = await (await bucket.get(receiptKey(domain, id)))?.json<CourseReceipt>();
	const groupId = blossomId(receipt?.groupId);
	if (!groupId || !receipt?.plan) throw new CatalogError("טופסי המטלות עדיין לא מוכנים.", 404);
	const assigned = receipt.assignmentCount ?? 0;
	return receipt.plan.lessons.slice(assigned).map(({ contentId, title }, index) => ({
		title: title ?? `שיעור ${assigned + index + 1}`,
		url: blossomPage(
			`edit/assignment/type=courseware&content=${contentId}&ws=${groupId}`,
			transport,
		),
	}));
}

class BlossomConnectionError extends CatalogError {}

async function post(
	url: string,
	authorization: string,
	data: object,
	signal: AbortSignal,
	step: string,
	maxBytes?: number,
) {
	const response = await fetch(url, {
		method: "POST",
		headers: { Authorization: authorization, "Content-Type": "application/json" },
		body: JSON.stringify(data),
		redirect: "manual",
		signal,
	}).catch(() => {
		throw new BlossomConnectionError("לא התקבלה תשובה מ־Blossom. נסו שוב בעוד כמה דקות.", 502);
	});
	const result = await readBlossomResponse(response, maxBytes);
	if (!response.ok) {
		if (
			result &&
			typeof result === "object" &&
			"error_msg" in result &&
			typeof result.error_msg === "string" &&
			/^group_name validation error:.*(?:in conflict with|name already exists)/i.test(
				result.error_msg,
			)
		)
			throw new CatalogError("שם הקורס כבר בשימוש ב־Blossom. בחרו שם אחר ונסו שוב.", 409);
		throw new CatalogError("Blossom דחה את " + step + " (HTTP " + response.status + ").", 502);
	}
	return result;
}

async function findCourse(
	domain: string,
	externalId: string,
	remote: () => Promise<string>,
	signal: AbortSignal,
	transport?: BlossomTransport,
) {
	const result = await post(
		blossomApiUrl("api_remote/groups", transport),
		await remote(),
		{ domain, filters: { external_id: externalId, type: "course", limit: 2 }, as_array: true },
		signal,
		"איתור הקורס דרך Remote API",
		256 * 1024,
	);
	if (Array.isArray(result) && result.length === 0) return;
	const course = Array.isArray(result) && result.length === 1 ? result[0] : null;
	const id = blossomId(course?.group_id);
	const name: unknown = course?.group_name;
	if (
		!id ||
		course.external_id !== externalId ||
		course.type !== "Course" ||
		typeof name !== "string"
	)
		throw new CatalogError("Blossom לא החזיר מזהה ייחודי לקורס.", 502);
	return { id, name };
}

async function saveCourse(
	name: string,
	externalId: string,
	domain: string,
	sync: string,
	signal: AbortSignal,
	transport?: BlossomTransport,
) {
	const result = await post(
		blossomApiUrl("sync_2/UpdateGroup", transport),
		sync,
		{ domain, details: { name, external_id: externalId, type: "course" } },
		signal,
		"שמירת הקורס",
	);
	if (!result || typeof result !== "object" || !("res" in result) || result.res !== "success")
		throw new CatalogError("Blossom לא אישר את שמירת הקורס.", 502);
}

async function renameCourse(
	course: { id: number; name: string },
	name: string,
	externalId: string,
	{ domain, sync, remote }: NonNullable<ReturnType<typeof courseSettings>>,
	signal: AbortSignal,
	transport?: BlossomTransport,
) {
	await saveCourse(name, externalId, domain, sync, signal, transport);
	let renamed = await findCourse(domain, externalId, remote, signal, transport);
	if (renamed?.id === course.id && renamed.name === course.name) {
		// UpdateGroup can honor the server setting that keeps workspace names unchanged.
		// ImportGroups accepts an explicit name for the verified external ID.
		await post(
			blossomApiUrl(`sync_2/ImportGroups/${domain}`, transport),
			sync,
			[{ name, external_id: externalId, type: "course" }],
			signal,
			"עדכון שם הקורס",
		);
		renamed = await findCourse(domain, externalId, remote, signal, transport);
	}
	if (renamed?.id !== course.id || renamed.name !== name)
		throw new CatalogError(
			"Blossom עדיין לא החזיר את שם הקורס המעודכן. נסו שוב בעוד רגע.",
			502,
		);
	return renamed;
}

export async function publishBlossomCourse(
	env: BlossomCourseEnv,
	store: CatalogDomain,
	id: string,
	revision: string | null,
	owner: string,
	transport?: BlossomTransport,
) {
	const config = courseSettings(env, owner);
	if (!config) throw new CatalogError("החיבור ליצירת קורסים ב־Blossom אינו זמין.", 503);
	const { domain, sync, remote } = config;
	const snapshot = await store.read();
	const gallery = snapshot.galleries.find(
		(entry) => entry.id === id && entry.section === "course",
	);
	if (!gallery) throw new CatalogError("הקורס לא נמצא.", 404);
	if (revision !== String(snapshot.revision))
		throw new CatalogError("הקטלוג השתנה. רעננו אותו לפני יצירת הקורס.", 409);

	const bucket = env.CONTENT;
	const key = receiptKey(domain, id);
	const previous = await bucket.get(key);
	const receipt: CourseReceipt = {
		leaseUntil: 0,
		assignmentCount: 0,
		...(await previous?.json<Partial<CourseReceipt>>()),
	};
	const ready =
		receipt.plan &&
		(receipt.groupId || receipt.assignmentCount === receipt.plan.lessons.length);
	const legacyName = receipt.plan && legacyCourseName(receipt.plan);
	if (receipt.plan && ready && !legacyName) return courseStatus(receipt.plan, receipt, transport);
	if (receipt.leaseUntil > Date.now())
		throw new CatalogError("יצירת הקורס כבר בטיפול. נסו שוב בעוד כמה דקות.", 409);

	let etag = previous?.etag;
	async function checkpoint() {
		const status = receipt.plan && courseStatus(receipt.plan, receipt, transport);
		const saved = await bucket.put(key, JSON.stringify(receipt), {
			onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" },
			customMetadata: status && {
				name: status.name,
				externalId: status.externalId,
				lessonCount: String(status.lessonCount),
				assignmentCount: String(status.assignmentCount),
				...(receipt.groupId ? { groupId: String(receipt.groupId) } : {}),
			},
		});
		if (!saved) throw new CatalogError("יצירת הקורס כבר בטיפול. נסו שוב בעוד כמה דקות.", 409);
		etag = saved.etag;
	}

	const signal = AbortSignal.timeout(240_000);
	receipt.leaseUntil = Date.now() + 5 * 60_000;
	await checkpoint();
	try {
		if (!receipt.plan) {
			const items = snapshot.items.filter((item) => galleryOf(item) === id);
			if (!items.length) throw new CatalogError("יש לשייך לפחות שיעור אחד לקורס.", 422);
			const { items: uploaded } = await blossomCatalog(env, store, owner);
			const packages = items.map((item) => {
				const variants: MediaKind[] = ["deck", "video"];
				const variant =
					variants.find((kind) => uploaded[item.id]?.[kind]) ??
					variants.find((kind) => scormPath(item, kind));
				if (!blossomItemId.test(item.id) || !variant)
					throw new CatalogError("חסרה חבילת SCORM לשיעור ״" + item.title + "״.", 422);
				return {
					id: item.id,
					title: item.title,
					variant,
					contentId: uploaded[item.id]?.[variant],
				};
			});
			const lessons: Lesson[] = [];
			for (const pkg of packages) {
				signal.throwIfAborted();
				const contentId =
					pkg.contentId ??
					(await uploadExistingScorm(env, store, pkg.id, pkg.variant, revision, owner, {
						signal,
						transport,
					}));
				lessons.push({ contentId, title: pkg.title });
			}
			if (String((await store.read()).revision) !== revision)
				throw new CatalogError("הקטלוג השתנה. רעננו אותו לפני יצירת הקורס.", 409);
			const hash = Array.from(
				new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id))),
				(value) => value.toString(16).padStart(2, "0"),
			).join("");
			receipt.plan = {
				name: gallery.name,
				externalId: "davinci4744-course-" + hash.slice(0, 32),
				lessons,
			};
			await checkpoint();
		}

		const plan = receipt.plan;
		const { externalId } = plan;
		let course = await findCourse(domain, externalId, remote, signal, transport);
		// Earlier exports used contentEnabled to record an existing workspace.
		if (!course && !ready && !receipt.created && !receipt.contentEnabled) {
			// Sync can adopt a workspace with the requested name when it has no external ID.
			// Create with a reserved name, then rename after confirming the external ID exists.
			if (!plan.draftName) {
				plan.draftName = "Da Vinci setup " + crypto.randomUUID();
				await checkpoint();
			}
			await saveCourse(plan.draftName, externalId, domain, sync, signal, transport);
			receipt.created = true;
			await checkpoint();
			course = await findCourse(domain, externalId, remote, signal, transport);
		}
		if (!course || (receipt.groupId && course.id !== receipt.groupId))
			throw new CatalogError("הקורס עדיין לא נמצא ב־Blossom. נסו שוב בעוד רגע.", 502);
		if (course.name === plan.draftName || (legacyName && course.name === plan.name)) {
			const name =
				ready && legacyName && gallery.name.slice(0, 80).trimEnd() !== legacyName
					? legacyName
					: gallery.name;
			course = await renameCourse(course, name, externalId, config, signal, transport);
		}
		plan.name = course.name;
		delete plan.draftName;
		receipt.groupId = course.id;
		receipt.leaseUntil = 0;
		return courseStatus(plan, receipt, transport);
	} catch (error) {
		if (error instanceof BlossomConnectionError) throw error;
		receipt.leaseUntil = 0;
		if (signal.aborted)
			throw new CatalogError("תם הזמן ליצירת הקורס. אפשר להמשיך בניסיון נוסף.", 502);
		throw error;
	} finally {
		await checkpoint();
	}
}
