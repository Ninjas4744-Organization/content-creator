export const galleryGroups = [
	{ section: undefined, label: "ספריות כלליות", addLabel: "הוספת ספרייה" },
	{ section: "course", label: "קורסים", addLabel: "הוספת קורס" },
] as const;

export const viewNames: Record<string, string> = {
	all: "כל התכנים",
	featured: "תכנים מומלצים",
	history: "היסטוריית שינויים",
};
