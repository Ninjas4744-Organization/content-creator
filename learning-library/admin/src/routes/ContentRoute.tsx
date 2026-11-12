import { useLayoutEffect, useState, type PropsWithChildren } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { observer } from "mobx-react-lite";
import { GallerySettings } from "../features/catalog/GallerySettings";
import { ContentScreen } from "../screens/ContentScreen";
import { useAdminWorkspace } from "./AdminRoute";
import { libraryHref } from "./adminNavigation";

function ContentRoute({
	tab,
	view = "all",
	children,
}: PropsWithChildren<{
	tab: "all" | "library" | "new";
	view?: string;
}>) {
	const workspace = useAdminWorkspace();
	const { store } = workspace;
	useLayoutEffect(() => {
		store.setView(view);
	}, [store, view]);
	return (
		<ContentScreen {...workspace} tab={tab}>
			{children}
		</ContentScreen>
	);
}

export function AllContentRoute() {
	const { featured } = useLocalSearchParams<{ featured?: string }>();
	return <ContentRoute tab="all" view={featured === "1" ? "featured" : "all"} />;
}

export const LibraryContentRoute = observer(function LibraryContentRoute() {
	const { gallery: id } = useLocalSearchParams<{ gallery?: string }>();
	const { store } = useAdminWorkspace();
	const gallery = store.galleries.find((entry) => entry.id === id);
	if (!gallery && !store.loading && store.galleries.length > 0) return <Redirect href="/" />;
	return (
		<ContentRoute tab="library" view={gallery?.id}>
			{gallery && (
				<GallerySettings
					key={JSON.stringify([gallery.id, gallery.name, gallery.url, gallery.section])}
					store={store}
					gallery={gallery}
				/>
			)}
		</ContentRoute>
	);
});

export function NewLibraryRoute() {
	const { store } = useAdminWorkspace();
	const { type } = useLocalSearchParams<{ type?: string }>();
	const [created, setCreated] = useState<string | null>(null);
	if (created) return <Redirect href={libraryHref(created)} />;
	return (
		<ContentRoute tab="new">
			<GallerySettings
				key={type}
				store={store}
				initialCourse={type === "course"}
				onCreated={setCreated}
			/>
		</ContentRoute>
	);
}
