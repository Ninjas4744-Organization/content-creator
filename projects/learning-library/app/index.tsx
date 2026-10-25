import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { CatalogStore } from "../src/features/catalog/CatalogStore";
import { createBrowserRepository } from "../src/core/browserRepository";
import { LibraryScreen } from "../src/screens/LibraryScreen";
import type { MediaKind } from "../src/models/catalog";

export default function LibraryRoute() {
	const [store] = useState(() => new CatalogStore(createBrowserRepository()));
	const router = useRouter();
	const params = useLocalSearchParams<{ item?: string; view?: string }>();

	useEffect(() => {
		void store.load();
		return store.dispose;
	}, [store]);
	const open = (id: string, kind: MediaKind) => {
		router.push({ pathname: "/", params: { item: id, view: kind } });
	};
	return (
		<>
			<Head>
				<title>ספריית למידה · דה וינצ׳י 4744</title>
			</Head>
			<LibraryScreen
				store={store}
				selectedId={params.item}
				selectedKind={params.view === "video" ? "video" : "deck"}
				onOpen={open}
				onClose={() => router.replace("/")}
			/>
		</>
	);
}
