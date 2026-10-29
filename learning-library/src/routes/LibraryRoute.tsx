import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { CatalogStore } from "../features/catalog/CatalogStore";
import { galleries } from "../features/catalog/galleries";
import { createBrowserRepository } from "../core/browserRepository";
import { LibraryScreen } from "../screens/LibraryScreen";
import type { GalleryScope, MediaKind } from "../models/catalog";

export function LibraryRoute({ gallery = "public" }: { gallery?: GalleryScope }) {
	const [store] = useState(() => new CatalogStore(createBrowserRepository(), gallery));
	const details = galleries[gallery];
	const pathname = details.pathname;
	const router = useRouter();
	const params = useLocalSearchParams<{ item?: string; view?: string }>();
	useEffect(() => {
		void store.load();
		return store.dispose;
	}, [store]);
	const open = (id: string, kind: MediaKind) => {
		router.push({ pathname, params: { item: id, view: kind } });
	};
	return (
		<>
			<Head>
				<title>{details.title} · דה וינצ׳י 4744</title>
				{gallery !== "public" && <meta name="robots" content="noindex,nofollow" />}
			</Head>
			<LibraryScreen
				store={store}
				selectedId={params.item}
				selectedKind={params.view === "video" ? "video" : "deck"}
				onOpen={open}
				onClose={() => router.replace(pathname)}
			/>
		</>
	);
}
