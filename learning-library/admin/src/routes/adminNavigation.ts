export const adminSections = {
	content: { href: "/", title: "ניהול תכנים", icon: "library" },
	sources: { href: "/sources", title: "ניהול מקורות", icon: "image" },
	history: { href: "/history", title: "היסטוריית שינויים", icon: "history" },
} as const;

export type AdminSection = keyof typeof adminSections;

export const sourceTabs = {
	albums: { href: "/sources", title: "אלבומי תמונות" },
	themes: { href: "/sources/themes", title: "ערכות נושא" },
} as const;

export type SourceSection = keyof typeof sourceTabs;

export function libraryHref(gallery: string) {
	return { pathname: "/content/library", params: { gallery } } as const;
}
