import { Link, useLocalSearchParams } from "expo-router";
import { observer } from "mobx-react-lite";
import { libraryHref } from "../../routes/adminNavigation";
import { Icon } from "../../ui/Icon";
import { SectionTabs, SectionTab } from "../../ui/SectionTabs";
import type { CatalogStore } from "./CatalogStore";

export const GalleryTabs = observer(function GalleryTabs({
	store,
	tab,
}: {
	store: CatalogStore;
	tab: "all" | "library" | "new";
}) {
	const { type } = useLocalSearchParams<{ type?: string }>();
	const publicGallery = store.galleries.find(({ id }) => id === "public");
	const directGallery = store.galleries.find(({ id }) => id === "none");
	const libraries = store.galleries.filter(({ id }) => id !== "public" && id !== "none");
	const galleryTab = ({ id, name, section }: (typeof store.galleries)[number]) => (
		<Link key={id} href={libraryHref(id)} asChild push>
			<SectionTab aria-current={tab === "library" && store.view === id ? "page" : undefined}>
				{section === "course" ? "קורס · " + name : name}
			</SectionTab>
		</Link>
	);
	return (
		<SectionTabs aria-label="ספריות תוכן">
			<Link href="/" asChild push>
				<SectionTab aria-current={tab === "all" ? "page" : undefined}>כל התכנים</SectionTab>
			</Link>
			{publicGallery && galleryTab(publicGallery)}
			{libraries.map(galleryTab)}
			<Link href="/content/new" asChild push>
				<SectionTab aria-current={tab === "new" && type !== "course" ? "page" : undefined}>
					<Icon name="plus" size={15} />
					הוספת ספרייה
				</SectionTab>
			</Link>
			<Link href="/content/new?type=course" asChild push>
				<SectionTab aria-current={tab === "new" && type === "course" ? "page" : undefined}>
					<Icon name="plus" size={15} />
					הוספת קורס
				</SectionTab>
			</Link>
			{directGallery && galleryTab(directGallery)}
		</SectionTabs>
	);
});
