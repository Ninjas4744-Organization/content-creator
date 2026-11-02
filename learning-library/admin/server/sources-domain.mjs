import { CatalogError } from "./catalog-domain.mjs";
import seed from "../fixtures/photo-albums.json" with { type: "json" };
import { defaultBackgrounds, validateBackgroundAsset } from "./background-assets.mjs";

const fail = (message, status = 400) => {
	throw new CatalogError(message, status);
};
const conflict = () => fail("המקורות עודכנו בחלון אחר. טענו מחדש לפני שמירה נוספת.", 409);
export function validateSourceDocument(value) {
	if (!value || value.version !== 1 || !Array.isArray(value.albums) || value.albums.length > 100)
		fail("רשימת המקורות חייבת לכלול עד 100 אלבומים בגרסה 1.");
	const ids = new Set();
	const albums = value.albums.map((album) => {
		if (!album || typeof album !== "object" || Array.isArray(album)) fail("אלבום אינו תקין.");
		if (
			typeof album.id !== "string" ||
			!/^[a-z0-9][a-z0-9-]{0,119}$/.test(album.id) ||
			ids.has(album.id)
		)
			fail("מזהה אלבום חייב להיות ייחודי ולכלול אותיות קטנות באנגלית, ספרות ומקפים.");
		ids.add(album.id);
		if (typeof album.title !== "string" || !album.title.trim() || album.title.length > 300)
			fail("יש למלא שם אלבום באורך של עד 300 תווים.");
		let url;
		try {
			url = new URL(album.url);
		} catch {
			fail("יש להזין קישור משותף של Google Photos.");
		}
		if (
			typeof album.url !== "string" ||
			album.url.length > 2000 ||
			/[\s\\]/.test(album.url) ||
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.port ||
			url.hash ||
			!(
				(url.hostname === "photos.app.goo.gl" &&
					/^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) ||
				(url.hostname === "photos.google.com" &&
					/^\/share\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))
			)
		)
			fail("יש להזין קישור HTTPS משותף של Google Photos, ללא פרטי התחברות.");
		const context = album.context === undefined ? "" : album.context;
		const tags = album.tags === undefined ? [] : album.tags;
		const enabled = album.enabled === undefined ? true : album.enabled;
		if (typeof context !== "string" || context.length > 2000)
			fail("ההקשר מוגבל ל־2,000 תווים.");
		if (
			!Array.isArray(tags) ||
			tags.length > 20 ||
			tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 60)
		)
			fail("אפשר להוסיף עד 20 תגיות, עד 60 תווים לתגית.");
		if (typeof enabled !== "boolean") fail("זמינות האלבום אינה תקינה.");
		return {
			...structuredClone(album),
			title: album.title.trim(),
			context: context.trim(),
			tags: [...new Set(tags.map((tag) => tag.trim()))],
			enabled,
		};
	});
	const document = {
		...structuredClone(value),
		version: 1,
		albums,
		backgrounds: validateBackgrounds(
			value.backgrounds === undefined ? defaultBackgrounds : value.backgrounds,
		),
	};
	if (new TextEncoder().encode(JSON.stringify(document)).length > 256 * 1024)
		fail("רשימת המקורות גדולה מדי.", 413);
	return document;
}
export function validateBackgrounds(value) {
	if (!Array.isArray(value) || !value.length || value.length > 100)
		fail("יש לשמור בין רקע אחד ל־100 רקעים.");
	const ids = new Set();
	for (const background of value) {
		if (
			!background ||
			typeof background.id !== "string" ||
			!/^[a-z0-9][a-z0-9-]{0,119}$/.test(background.id) ||
			ids.has(background.id)
		)
			fail("מזהה רקע אינו תקין או כבר קיים.");
		ids.add(background.id);
		for (const [key, max] of [
			["name", 160],
			["description", 2000],
		])
			if (
				typeof background[key] !== "string" ||
				!background[key].trim() ||
				background[key].length > max
			)
				fail("יש למלא שם ותיאור לרקע (עד 160 ו־2,000 תווים).");
		if (typeof background.enabled !== "boolean") fail("זמינות הרקע אינה תקינה.");
		validateBackgroundAsset(background.image);
		if (background.coverImage !== undefined) validateBackgroundAsset(background.coverImage);
	}
	if (!value.some((background) => background.enabled))
		fail("חייב להישאר לפחות רקע פעיל אחד לבחירת האייג׳נט.");
	return structuredClone(value);
}
export function initialSourceState() {
	return { document: validateSourceDocument(seed), revision: 0, updatedAt: null, history: [] };
}
export function sourceSnapshot(state, mode) {
	return { ...state.document, revision: state.revision, updatedAt: state.updatedAt, mode };
}
export function sourceHistory(state) {
	return state.history.map(({ document, ...entry }) => ({
		...entry,
		count: document.albums.length,
		backgroundCount: validateSourceDocument(document).backgrounds.length,
	}));
}
export class SourcesDomain {
	#queue = Promise.resolve();
	constructor(storage) {
		this.storage = storage;
	}
	async read() {
		const state = await this.storage.read();
		return { ...state, document: validateSourceDocument(state.document) };
	}
	change(revision, input) {
		const operation = this.#queue.then(async () => {
			const before = await this.read();
			if (revision !== String(before.revision)) conflict();
			let document = before.document;
			let action;
			if (input.type === "restore") {
				const entry = before.history.find((entry) => entry.id === input.id);
				if (!entry) fail("גרסת המקורות לא נמצאה.", 404);
				document = entry.document;
				action = "שחזור מקורות";
			} else if (
				["create-background", "update-background", "delete-background"].includes(input.type)
			) {
				let backgrounds = document.backgrounds;
				if (input.type === "delete-background") {
					if (!backgrounds.some((background) => background.id === input.id))
						fail("הרקע לא נמצא.", 404);
					backgrounds = backgrounds.filter((background) => background.id !== input.id);
					action = "הסרת רקע";
				} else {
					const incoming = input.background;
					if (!incoming || typeof incoming !== "object" || Array.isArray(incoming))
						fail("רשומת הרקע אינה תקינה.");
					const id =
						input.type === "create-background"
							? `background-${crypto.randomUUID()}`
							: incoming.id;
					const existing = backgrounds.find((background) => background.id === id);
					if (input.type === "update-background" && !existing) fail("הרקע לא נמצא.", 404);
					const background = { ...existing, ...incoming, id };
					if (incoming.coverImage === undefined) delete background.coverImage;
					backgrounds = existing
						? backgrounds.map((entry) => (entry.id === id ? background : entry))
						: [...backgrounds, background];
					action = `${existing ? "עריכת" : "הוספת"} רקע: ${background.name}`;
				}
				document = { ...document, backgrounds };
			} else if (input.type === "delete") {
				if (!document.albums.some((album) => album.id === input.id))
					fail("האלבום לא נמצא.", 404);
				document = {
					...document,
					albums: document.albums.filter((album) => album.id !== input.id),
				};
				action = "הסרת אלבום מהמקורות";
			} else if (["create", "update"].includes(input.type)) {
				const incoming =
					input.type === "create" && input.album && input.album.id === undefined
						? { ...input.album, id: `album-${crypto.randomUUID()}` }
						: input.album;
				const album = validateSourceDocument({ version: 1, albums: [incoming] }).albums[0];
				const existing = document.albums.find((entry) => entry.id === album.id);
				if (input.type === "create" && existing) fail("מזהה האלבום כבר קיים.");
				if (input.type === "update" && !existing) fail("האלבום לא נמצא.", 404);
				document = {
					...document,
					albums: existing
						? document.albums.map((entry) =>
								entry.id === album.id ? { ...entry, ...album } : entry,
							)
						: [...document.albums, album],
				};
				action = `${existing ? "עריכת" : "הוספת"} אלבום: ${album.title}`;
			} else fail("פעולת המקורות אינה תקינה.");
			const next = {
				document: validateSourceDocument(document),
				revision:
					typeof before.revision === "number" ? before.revision + 1 : before.revision,
				updatedAt: new Date().toISOString(),
				history: [
					{
						id: crypto.randomUUID(),
						at: new Date().toISOString(),
						action,
						revision: before.revision,
						document: before.document,
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
