import type { GalleryDefinition } from "../../models/catalog";

export function galleryDetails(gallery?: GalleryDefinition) {
	const name = gallery?.name ?? "ספריית למידה";
	const publicGallery = gallery?.id === "public";
	const isCourse = gallery?.section === "course";
	return {
		title: name,
		eyebrow: isCourse
			? "קורס"
			: publicGallery
				? "הידע של הקבוצה, פתוח לכולם"
				: "לומדים יחד בדה וינצ׳י 4744",
		hero: isCourse
			? name
			: publicGallery
				? "כל רעיון גדול\nמתחיל בלמידה."
				: `${name}\nכל הידע במקום אחד.`,
		description: isCourse
			? "בוחרים שיעור ומתקדמים בקצב שלכם."
			: "מצגות, סרטונים וחומרי למידה.\nבוחרים נושא ולומדים בקצב שלכם.",
		searchPlaceholder: "חיפוש נושא, פרק או מילת מפתח",
	};
}
