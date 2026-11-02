import type { CatalogInput, LearningItem } from "../models/catalog";

export function parseImport(value: unknown): CatalogInput {
	if (!Array.isArray(value)) {
		if (
			!value ||
			typeof value !== "object" ||
			!("schemaVersion" in value) ||
			value.schemaVersion !== 1 ||
			!("galleries" in value) ||
			!Array.isArray(value.galleries) ||
			!("items" in value) ||
			!Array.isArray(value.items)
		)
			throw new Error("קובץ הקטלוג אינו בפורמט נתמך. בחרו קובץ שיוצא מהאדמין או מהספרייה.");
		parseImport(value.items);
		return value as CatalogInput;
	}
	if (!Array.isArray(value) || value.length > 1000)
		throw new Error("הקובץ צריך להכיל מערך של עד 1,000 תכנים.");
	const ids = new Set<string>();
	for (const item of value) {
		if (
			!item ||
			typeof item.id !== "string" ||
			!/^[A-Za-z0-9_-]{1,120}$/.test(item.id) ||
			ids.has(item.id) ||
			typeof item.title !== "string" ||
			!Array.isArray(item.chapters)
		)
			throw new Error("כל תוכן חייב לכלול מזהה ייחודי, כותרת ורשימת פרקים.");
		ids.add(item.id);
	}
	return value as LearningItem[];
}
