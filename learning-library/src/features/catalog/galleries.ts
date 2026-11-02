import type { GalleryDefinition } from "../../models/catalog";
export function galleryDetails(gallery?: GalleryDefinition) {
	const name = gallery?.name ?? "ספריית למידה";
	const publicGallery = gallery?.id === "public";
	return {
		title: name,
		eyebrow: publicGallery ? "הידע של הקבוצה, פתוח לכולם" : "לומדים יחד בדה וינצ׳י 4744",
		hero: publicGallery ? "כל רעיון גדול\nמתחיל בלמידה." : `${name}\nכל הידע במקום אחד.`,
		description: "מצגות, סרטונים וחומרי למידה.\nבוחרים נושא ולומדים בקצב שלכם.",
		searchPlaceholder: "חיפוש נושא, פרק או מילת מפתח",
	};
}
