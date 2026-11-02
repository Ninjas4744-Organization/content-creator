import { useEffect, useState } from "react";
import { View } from "react-native";
import Head from "expo-router/head";
import { observer } from "mobx-react-lite";
import styled from "styled-components";
import { GalleryManager } from "../features/catalog/GalleryManager";
import { CatalogStore } from "../features/catalog/CatalogStore";
import { EditorStore } from "../features/editor/EditorStore";
import { EditorDialog } from "../features/editor/EditorDialog";
import { ImportDialog } from "../features/import/ImportDialog";
import { createBrowserRepository } from "../core/browserRepository";
import { AdminScreen } from "../screens/AdminScreen";
import { IconButton } from "../ui/browserControls";
import { Icon } from "../ui/Icon";
import { Body } from "../ui/primitives";

const Toast = styled.div`
	position: fixed;
	bottom: 25px;
	left: 25px;
	max-width: calc(100vw - 50px);
	z-index: 20;
	display: flex;
	align-items: center;
	gap: 15px;
	padding: 13px 20px;
	border-radius: 8px;
	background: #213b44;
	color: #edf5f4;
	box-shadow: 0 5px 25px #1d38372b;
	font: 12px/1.8 ${({ theme }) => theme.font};
`;
export const AdminRoute = observer(function AdminRoute() {
	const [store] = useState(() => new CatalogStore(createBrowserRepository()));
	const [editor] = useState(() => new EditorStore());
	const [importOpen, setImportOpen] = useState(false);
	const [galleriesOpen, setGalleriesOpen] = useState(false);
	const [ready, setReady] = useState(false);
	useEffect(() => {
		setReady(true);
		void store.load();
		return store.dispose;
	}, [store]);
	useEffect(() => {
		if (!store.message) return;
		const timer = setTimeout(() => store.notify(null), 6500);
		return () => clearTimeout(timer);
	}, [store, store.message]);
	// Keep the static export and first browser render identical at every viewport.
	// Responsive dimensions and native dialog APIs are initialized after hydration.
	if (!ready)
		return (
			<>
				<Head>
					<title>ניהול הספרייה · דה וינצ׳י 4744</title>
					<meta name="robots" content="noindex,nofollow" />
				</Head>
				<View style={{ padding: 40 }}>
					<Body accessibilityLiveRegion="polite">טוענים את סביבת הניהול…</Body>
				</View>
			</>
		);
	return (
		<>
			<Head>
				<title>ניהול הספרייה · דה וינצ׳י 4744</title>
				<meta name="robots" content="noindex,nofollow" />
			</Head>
			<AdminScreen
				store={store}
				onEdit={(item) => {
					store.setError(null);
					editor.edit(item);
				}}
				onImport={() => {
					store.setError(null);
					setImportOpen(true);
				}}
				onManageGalleries={() => {
					store.setError(null);
					setGalleriesOpen(true);
				}}
				onNavigate={store.setView}
			/>
			<EditorDialog editor={editor} catalog={store} />
			{galleriesOpen && (
				<GalleryManager store={store} open onClose={() => setGalleriesOpen(false)} />
			)}
			<ImportDialog store={store} open={importOpen} onClose={() => setImportOpen(false)} />
			{store.message && (
				<Toast role="status">
					{store.message}
					<IconButton aria-label="סגירת הודעה" onClick={() => store.notify(null)}>
						<Icon name="close" size={14} color="white" />
					</IconButton>
				</Toast>
			)}
		</>
	);
});
