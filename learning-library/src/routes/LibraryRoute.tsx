import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { CatalogStore } from "../features/catalog/CatalogStore";
import { createBrowserRepository } from "../core/browserRepository";
import { LibraryScreen } from "../screens/LibraryScreen";
import type { GalleryScope, MediaKind } from "../models/catalog";

export function LibraryRoute({ gallery = "public" }: { gallery?: GalleryScope }) {
	const [store] = useState(() => new CatalogStore(createBrowserRepository(), gallery));
	const pathname = gallery === "team" ? "/team-library" : "/";
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
				<title>
					{gallery === "team" ? "ספריית הקבוצה" : "ספריית למידה"} · דה וינצ׳י 4744
				</title>
				{gallery === "team" && <meta name="robots" content="noindex,nofollow" />}
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
