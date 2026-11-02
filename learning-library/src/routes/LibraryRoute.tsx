import { useEffect, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useLocalSearchParams, usePathname, useRouter, type Href } from "expo-router";
import Head from "expo-router/head";
import { CatalogStore } from "../features/catalog/CatalogStore";
import { galleryDetails } from "../features/catalog/galleries";
import { createBrowserRepository } from "../core/browserRepository";
import { viewerHref } from "../core/galleryRouting";
import { LibraryScreen } from "../screens/LibraryScreen";
import type { MediaKind } from "../models/catalog";

export const LibraryRoute = observer(function LibraryRoute() {
	const pathname = usePathname();
	const params = useLocalSearchParams<{
		item?: string;
		view?: string;
		gallery?: string;
	}>();
	const address = new URL(
		typeof window === "undefined"
			? `https://knowledge.davinci4744.com${pathname}`
			: window.location.href,
	);
	address.searchParams.delete("item");
	address.searchParams.delete("view");
	const selector = address.href;
	const store = useMemo(() => new CatalogStore(createBrowserRepository(), selector), [selector]);
	const details = galleryDetails(store.galleryDefinition);
	const router = useRouter();
	useEffect(() => {
		void store.load();
		return store.dispose;
	}, [store]);
	const open = (id: string, kind: MediaKind) =>
		router.push(viewerHref(window.location.href, id, kind) as Href);
	return (
		<>
			<Head>
				<title>{details.title} · דה וינצ׳י 4744</title>
				{store.gallery !== "public" && <meta name="robots" content="noindex,nofollow" />}
			</Head>
			<LibraryScreen
				store={store}
				selectedId={params.item}
				selectedKind={params.view === "video" ? "video" : "deck"}
				onOpen={open}
				onClose={() => router.replace(viewerHref(window.location.href) as Href)}
			/>
		</>
	);
});
