import type { PhotoAlbum } from "../../models/sources";

export function sourcePrompt(album: PhotoAlbum, kind: "deck" | "video"): string {
	return `${kind === "deck" ? "$davinci-presentation צור מצגת" : "$davinci-interactive-video צור סרטון אינטראקטיבי"} בנושא [הנושא שלי] לקהל [קהל היעד].
השתמש במקורות העדכניים מהאתר ובדוק את התאמת אלבום התמונות ״${album.title}״ (${album.id}) לקונטקסט.
קישור לאלבום: ${album.url}${album.context ? `\nהקשר: ${album.context}` : ""}${album.tags.length ? `\nתגיות: ${album.tags.join(", ")}` : ""}
בחר תמונות לפי התוכן שלהן והקשר ההסבר, ושמור את פרטי המקור בפרויקט.
בחר גם רקע אחד מהרקעים הפעילים באתר לפי שמו, תיאורו והקונטקסט. חובה לבחור רקע ולשמור את הבחירה בפרויקט.`;
}
