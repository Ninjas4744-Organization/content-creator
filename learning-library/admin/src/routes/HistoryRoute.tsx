import { observer } from "mobx-react-lite";
import {
	CatalogLoading,
	CatalogPanel,
	CatalogPanelHeader,
	CatalogStorageNote,
} from "../features/catalog/CatalogPanel";
import { HistoryPanel } from "../features/history/HistoryPanel";
import { Heading } from "../ui/primitives";
import { useAdminWorkspace } from "./AdminRoute";
import { adminSections } from "./adminNavigation";

export const HistoryRoute = observer(function HistoryRoute() {
	const { store, width, onImport } = useAdminWorkspace();
	const compact = width < 760;
	const title = adminSections.history.title;
	return (
		<>
			<Heading $compact={compact} accessibilityRole="header">
				{title}
			</Heading>
			<CatalogPanel>
				<CatalogPanelHeader
					store={store}
					compact={compact}
					title={title}
					count={store.history.length}
					onImport={onImport}
				/>
				{store.loading ? <CatalogLoading /> : <HistoryPanel store={store} />}
			</CatalogPanel>
			<CatalogStorageNote store={store} />
		</>
	);
});
