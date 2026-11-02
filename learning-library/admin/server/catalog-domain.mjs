const randomUUID = () => crypto.randomUUID();

export class CatalogError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.status = status;
	}
}

export const galleryOf = (item) => item.gallery ?? (item.unlisted ? "team" : "public");
const fail = (message) => {
	throw new CatalogError(message);
};

export const defaultGalleries = [
	{ id: "public", name: "ספרייה ציבורית", url: "/" },
	{ id: "team", name: "ספריית הקבוצה", url: "/team-library" },
	{ id: "study", name: "למידה למבחנים", url: "/study-library" },
	{ id: "none", name: "בקישור בלבד", url: "/" },
];
const fixedGallery = (id) => id === "public" || id === "none";

function withGalleryUrls(galleries = defaultGalleries) {
	return galleries.map((gallery) => ({
		...gallery,
		url:
			gallery.url === undefined
				? (defaultGalleries.find((entry) => entry.id === gallery.id)?.url ?? "/")
				: gallery.url,
	}));
}

function galleryUrl(value) {
	const message = "יש להזין נתיב שמתחיל ב־/ או כתובת HTTP/HTTPS תקינה, ללא פרטי התחברות.";
	if (typeof value !== "string" || !value.trim() || value.trim().length > 2000) fail(message);
	const url = value.trim();
	if (
		/[\u0000-\u0020\u007f\\]/.test(url) ||
		(!(url.startsWith("/") && !url.startsWith("//")) && !/^https?:\/\//i.test(url))
	)
		fail(message);
	let parsed;
	try {
		parsed = new URL(url, "https://knowledge.davinci4744.com/");
	} catch {
		fail(message);
	}
	if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
		fail(message);
	return url;
}

function galleryName(value) {
	if (typeof value !== "string" || !value.trim() || value.trim().length > 100)
		fail("יש למלא שם ספרייה באורך של עד 100 תווים.");
	return value.trim();
}

export function validateGalleries(value) {
	if (!Array.isArray(value) || value.length < 2 || value.length > 100)
		fail("אפשר לשמור עד 100 ספריות.");
	const ids = new Set();
	const names = new Set();
	for (const gallery of value) {
		if (
			!gallery ||
			typeof gallery.id !== "string" ||
			!/^[A-Za-z0-9_-]{1,120}$/.test(gallery.id) ||
			["all", "featured", "history"].includes(gallery.id) ||
			ids.has(gallery.id)
		)
			fail("מזהה הספרייה אינו תקין או כבר קיים.");
		const name = galleryName(gallery.name);
		if (galleryUrl(gallery.url) !== gallery.url) fail("קישור הספרייה אינו תקין.");
		if (name !== gallery.name || names.has(name.toLocaleLowerCase("he")))
			fail("שם הספרייה כבר קיים או אינו תקין.");
		ids.add(gallery.id);
		names.add(name.toLocaleLowerCase("he"));
	}
	for (const fixed of defaultGalleries.filter((gallery) => fixedGallery(gallery.id))) {
		if (
			!value.some(
				(gallery) =>
					gallery.id === fixed.id &&
					gallery.name === fixed.name &&
					gallery.url === fixed.url,
			)
		)
			fail("אי אפשר לשנות או למחוק ספרייה קבועה.");
	}
	return structuredClone(value);
}

export function validateCatalog(value, galleries = defaultGalleries) {
	if (!Array.isArray(value) || value.length > 1000)
		fail("הקטלוג חייב להיות רשימה של עד 1,000 תכנים.");
	const ids = new Set();
	const galleryIds = new Set(galleries.map((gallery) => gallery.id));
	for (const item of value) {
		if (!item || typeof item !== "object" || Array.isArray(item))
			fail("רשומת תוכן אינה תקינה.");
		if (typeof item.id !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(item.id))
			fail("מזהה התוכן יכול לכלול אותיות באנגלית, ספרות, מקף וקו תחתון בלבד.");
		if (ids.has(item.id)) fail("מזהה תוכן מופיע יותר מפעם אחת.");
		ids.add(item.id);
		for (const [key, max, required] of [
			["title", 300, true],
			["description", 10000, false],
			["category", 200, true],
		]) {
			if (
				typeof item[key] !== "string" ||
				item[key].length > max ||
				(required && !item[key].trim())
			)
				fail("יש למלא כותרת וקטגוריה ולבדוק את אורך הטקסט.");
		}
		for (const key of ["featured", "unlisted"]) {
			if (item[key] !== undefined && typeof item[key] !== "boolean")
				fail("ערך סימון אינו תקין.");
		}
		if (!galleryIds.has(galleryOf(item))) fail("בחירת הספרייה אינה תקינה.");
		for (const key of ["slides", "checkpoints"]) {
			if (!Number.isSafeInteger(item[key]) || item[key] < 0 || item[key] > 100000)
				fail("מספר שקפים או שאלות אינו תקין.");
		}
		if (
			item.duration !== null &&
			(typeof item.duration !== "number" ||
				!Number.isFinite(item.duration) ||
				item.duration < 0 ||
				item.duration > 1000000)
		)
			fail("משך הסרטון אינו תקין.");
		if (
			!Array.isArray(item.chapters) ||
			item.chapters.length > 1000 ||
			item.chapters.some((chapter) => typeof chapter !== "string" || chapter.length > 500)
		)
			fail("רשימת הפרקים אינה תקינה.");
		const validPath = (path) =>
			typeof path === "string" &&
			path.length < 1000 &&
			/^library\/(?:releases\/[a-f0-9]{32}\/)?(?:media|exports)\/[A-Za-z0-9_./-]+$/.test(
				path,
			) &&
			!path.split("/").some((part) => !part || part.startsWith("."));
		for (const key of ["poster", "deck", "video", "powerpoint"]) {
			if (item[key] != null && item[key] !== "" && !validPath(item[key]))
				fail("קישור מדיה חייב להיות נתיב תקין תחת library/media או library/releases.");
		}
		if (
			item.scorm !== undefined &&
			(!item.scorm ||
				typeof item.scorm !== "object" ||
				Array.isArray(item.scorm) ||
				Object.entries(item.scorm).some(
					([key, path]) => !["deck", "video"].includes(key) || !validPath(path),
				))
		)
			fail("קישורי SCORM אינם תקינים.");
	}
	return structuredClone(value);
}

// Canonical interchange format. Arrays remain readable for older published catalogs.
export function validateDocument(value) {
	if (Array.isArray(value))
		return {
			schemaVersion: 1,
			galleries: structuredClone(defaultGalleries),
			items: validateCatalog(value),
		};
	if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== 1)
		fail("מבנה הקטלוג או גרסתו אינם נתמכים.");
	if (!Array.isArray(value.galleries)) fail("הקטלוג חייב לכלול רשימת ספריות.");
	const galleries = validateGalleries(withGalleryUrls(value.galleries));
	return {
		...structuredClone(value),
		schemaVersion: 1,
		galleries,
		items: validateCatalog(value.items, galleries),
	};
}

function documentMetadata({ schemaVersion, items, galleries, ...metadata }) {
	return metadata;
}
export function documentOf(state) {
	return {
		...state.catalogMetadata,
		schemaVersion: 1,
		galleries: state.galleries,
		items: state.items,
	};
}

export function stateFromDocument(value, revision = 0, updatedAt = null) {
	const catalog = validateDocument(value);
	return {
		revision,
		updatedAt,
		galleries: catalog.galleries,
		items: catalog.items,
		catalogMetadata: documentMetadata(catalog),
		history: [],
	};
}

export class CatalogDomain {
	#queue = Promise.resolve();
	constructor(storage) {
		this.storage = storage;
	}
	async read() {
		const state = await this.storage.read();
		return {
			...state,
			catalogMetadata: state.catalogMetadata ?? {},
			galleries: withGalleryUrls(state.galleries),
		};
	}
	async history() {
		const entries = this.storage.history
			? await this.storage.history()
			: (await this.read()).history;
		return entries.map(({ items, galleries, catalogMetadata, ...entry }) => ({
			...entry,
			count: items?.length ?? entry.count,
		}));
	}
	mutate(revision, items, action, restoreId) {
		return this.#mutate(revision, async (before) => {
			if (!restoreId) return { items, galleries: before.galleries, action };
			const snapshot =
				before.history.find((entry) => entry.id === restoreId) ??
				(this.storage.snapshot ? await this.storage.snapshot(restoreId) : null);
			if (!snapshot) throw new CatalogError("הגרסה המבוקשת לא נמצאה.", 404);
			return {
				items: snapshot.items,
				galleries: withGalleryUrls(snapshot.galleries),
				catalogMetadata: snapshot.catalogMetadata ?? {},
				action: "שחזור גרסה קודמת",
			};
		});
	}
	importCatalog(revision, value, mode) {
		return this.#mutate(revision, (before) => {
			if (!["merge", "overwrite", "replace"].includes(mode)) fail("מצב הייבוא אינו תקין.");
			const incoming = validateDocument(value);
			if (mode === "replace")
				return {
					...incoming,
					catalogMetadata: documentMetadata(incoming),
					action: "החלפת הקטלוג והספריות מייבוא",
				};
			const galleries = new Map(before.galleries.map((gallery) => [gallery.id, gallery]));
			// Legacy arrays carry no library settings and cannot recreate deleted libraries.
			if (!Array.isArray(value))
				for (const gallery of incoming.galleries)
					if (mode === "overwrite" || !galleries.has(gallery.id))
						galleries.set(gallery.id, gallery);
			const items = new Map(before.items.map((item) => [item.id, item]));
			for (const item of incoming.items) {
				if (mode === "merge" && items.has(item.id)) continue;
				items.set(
					item.id,
					galleries.has(galleryOf(item))
						? item
						: { ...item, gallery: "none", unlisted: true },
				);
			}
			return {
				items: [...items.values()],
				galleries: [...galleries.values()],
				catalogMetadata:
					mode === "overwrite"
						? { ...before.catalogMetadata, ...documentMetadata(incoming) }
						: { ...documentMetadata(incoming), ...before.catalogMetadata },
				action: "ייבוא קטלוג וספריות",
			};
		});
	}
	mutateGallery(revision, input) {
		return this.#mutate(revision, (before) => {
			let galleries = before.galleries;
			let items = before.items;
			let action;
			if (input.type === "create") {
				const name = galleryName(input.name);
				const url = galleryUrl(input.url === undefined ? "/" : input.url);
				galleries = [...galleries, { id: `gallery-${randomUUID()}`, name, url }];
				action = `הוספת ספרייה: ${name}`;
			} else {
				if (!["update", "rename", "delete"].includes(input.type))
					fail("פעולת הספרייה אינה תקינה.");
				if (fixedGallery(input.id)) fail("אי אפשר לשנות או למחוק ספרייה קבועה.");
				const gallery = galleries.find((entry) => entry.id === input.id);
				if (!gallery) throw new CatalogError("הספרייה לא נמצאה.", 404);
				if (input.type === "rename" || input.type === "update") {
					const name = galleryName(input.name);
					const url = input.type === "update" ? galleryUrl(input.url) : gallery.url;
					galleries = galleries.map((entry) =>
						entry.id === input.id ? { ...entry, name, url } : entry,
					);
					action =
						input.type === "update"
							? `עריכת ספרייה: ${name}`
							: `שינוי שם ספרייה: ${gallery.name} ← ${name}`;
				} else {
					galleries = galleries.filter((entry) => entry.id !== input.id);
					items = items.map((item) =>
						galleryOf(item) === input.id
							? { ...item, gallery: "none", unlisted: true }
							: item,
					);
					action = `מחיקת ספרייה: ${gallery.name} והעברת תכניה לבקישור בלבד`;
				}
			}
			return { items, galleries, action };
		});
	}
	#mutate(revision, update) {
		const operation = this.#queue.then(async () => {
			const before = await this.read();
			if (revision !== String(before.revision))
				throw new CatalogError(
					"הקטלוג עודכן בחלון אחר. רעננו את הדף לפני שמירה נוספת.",
					409,
				);
			const change = await update(before);
			const galleries = validateGalleries(change.galleries);
			const next = {
				revision:
					typeof before.revision === "number" ? before.revision + 1 : before.revision,
				updatedAt: new Date().toISOString(),
				galleries,
				catalogMetadata: change.catalogMetadata ?? before.catalogMetadata,
				items: validateCatalog(change.items, galleries),
				history: [
					{
						id: randomUUID(),
						at: new Date().toISOString(),
						action: String(change.action || "עדכון קטלוג").slice(0, 300),
						revision: before.revision,
						items: before.items,
						galleries: before.galleries,
						catalogMetadata: before.catalogMetadata,
					},
					...before.history,
				].slice(0, 30),
			};
			return (await this.storage.write(next, before)) ?? next;
		});
		this.#queue = operation.catch(() => {});
		return operation;
	}
}
