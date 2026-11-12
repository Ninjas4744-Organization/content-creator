import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { View, useWindowDimensions } from "react-native";
import { usePathname } from "expo-router";
import Head from "expo-router/head";
import { observer } from "mobx-react-lite";
import styled from "styled-components";
import { CatalogStore } from "../features/catalog/CatalogStore";
import { EditorStore } from "../features/editor/EditorStore";
import { EditorDialog } from "../features/editor/EditorDialog";
import { ImportDialog } from "../features/import/ImportDialog";
import { CreatorTools } from "../features/creator/CreatorTools";
import { SourcesStore } from "../features/sources/SourcesStore";
import { createBrowserSourcesRepository } from "../core/browserSourcesRepository";
import { createBrowserRepository } from "../core/browserRepository";
import { AdminScreen } from "../screens/AdminScreen";
import type { LearningItem } from "../models/catalog";
import { IconButton, WebLink } from "../ui/browserControls";
import { Icon } from "../ui/Icon";
import { Body } from "../ui/primitives";
import { adminSections, type AdminSection } from "./adminNavigation";

const Toast = styled.div`
	position: fixed;
	inset-block-end: 25px;
	inset-inline-end: 25px;
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
const ErrorBox = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 15px;
	padding: 14px 18px;
	border: 1px solid #e5cbc5;
	border-radius: 7px;
	background: #fff7f4;
	color: ${({ theme }) => theme.danger};
	font: 12px/1.9 ${({ theme }) => theme.font};
`;

interface Workspace {
	store: CatalogStore;
	sources: SourcesStore;
	width: number;
	onEdit(item: LearningItem): void;
	onImport(): void;
	onCreatorTools(): void;
}
const WorkspaceContext = createContext<Workspace | null>(null);
export function useAdminWorkspace() {
	const workspace = useContext(WorkspaceContext);
	if (!workspace) throw new Error("Admin screen rendered outside the workspace");
	return workspace;
}

export const AdminRoute = observer(function AdminRoute({ children }: PropsWithChildren) {
	const pathname = usePathname();
	const root = pathname.split("/")[1];
	const section: AdminSection = root === "sources" || root === "history" ? root : "content";
	const { width } = useWindowDimensions();
	const [store] = useState(() => new CatalogStore(createBrowserRepository()));
	const [editor] = useState(() => new EditorStore());
	const [sources] = useState(() => new SourcesStore(createBrowserSourcesRepository()));
	const [importOpen, setImportOpen] = useState(false);
	const [creatorOpen, setCreatorOpen] = useState(false);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		setReady(true);
		void store.load();
		return () => {
			store.dispose();
			sources.dispose();
		};
	}, [store, sources]);
	useEffect(() => {
		if (section === "sources") void sources.load();
		if (section === "history") void store.loadHistory();
	}, [section, sources, store]);
	useEffect(() => {
		if (!store.message) return;
		const timer = setTimeout(() => store.notify(null), 6500);
		return () => clearTimeout(timer);
	}, [store, store.message]);

	return (
		<>
			<Head>
				<title>{adminSections[section].title} · דה וינצ׳י 4744</title>
				<meta name="robots" content="noindex,nofollow" />
			</Head>
			{ready ? (
				<WorkspaceContext.Provider
					value={{
						store,
						sources,
						width,
						onEdit: (item) => {
							store.setError(null);
							editor.edit(item, store.topicsFor(item));
						},
						onImport: () => {
							store.setError(null);
							setImportOpen(true);
						},
						onCreatorTools: () => setCreatorOpen(true),
					}}
				>
					<AdminScreen
						section={section}
						compact={width < 760}
						count={store.items.length}
						production={store.production}
						workspaceLabel={store.workspaceLabel}
					>
						{section !== "sources" && store.error && (
							<ErrorBox role="alert">
								<span>{store.error}</span>
								<WebLink
									as="button"
									type="button"
									onClick={() => void store.load()}
								>
									טעינה מחדש
								</WebLink>
								<IconButton
									aria-label="סגירת הודעת שגיאה"
									onClick={() => store.setError(null)}
								>
									<Icon name="close" size={15} />
								</IconButton>
							</ErrorBox>
						)}
						{children}
					</AdminScreen>
					<EditorDialog editor={editor} catalog={store} />
					{creatorOpen && (
						<CreatorTools
							production={store.production}
							onClose={() => setCreatorOpen(false)}
						/>
					)}
					<ImportDialog
						store={store}
						open={importOpen}
						onClose={() => setImportOpen(false)}
					/>
					{store.message && (
						<Toast role="status">
							{store.message}
							<IconButton aria-label="סגירת הודעה" onClick={() => store.notify(null)}>
								<Icon name="close" size={14} color="white" />
							</IconButton>
						</Toast>
					)}
				</WorkspaceContext.Provider>
			) : (
				<View style={{ padding: 40 }}>
					<Body accessibilityLiveRegion="polite">טוענים את סביבת הניהול…</Body>
				</View>
			)}
		</>
	);
});
