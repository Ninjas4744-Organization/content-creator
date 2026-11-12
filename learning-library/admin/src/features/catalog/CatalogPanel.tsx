import { ActivityIndicator, View } from "react-native";
import { observer } from "mobx-react-lite";
import styled, { useTheme } from "styled-components/native";
import { apiUrl } from "../../core/browserRepository";
import { WebLink } from "../../ui/browserControls";
import { Icon } from "../../ui/Icon";
import { Body, Button, ButtonText, Label, Row } from "../../ui/primitives";
import type { CatalogStore } from "./CatalogStore";

export const CatalogPanel = styled.View`
	border-radius: 10px;
	border-width: 1px;
	border-color: ${({ theme }) => theme.border};
	background-color: ${({ theme }) => theme.surface};
	overflow: hidden;
`;

export const CatalogPanelHeader = observer(function CatalogPanelHeader({
	store,
	compact,
	title,
	count,
	onImport,
}: {
	store: CatalogStore;
	compact: boolean;
	title: string;
	count: number;
	onImport(): void;
}) {
	const theme = useTheme();
	return (
		<Row
			style={{
				justifyContent: "space-between",
				padding: compact ? 18 : 24,
				flexWrap: "wrap",
			}}
		>
			<View style={{ gap: 5 }}>
				<Label style={{ fontSize: 16 }}>
					{title} <Label style={{ fontSize: 12, color: theme.muted }}>{count}</Label>
				</Label>
				<Body style={{ fontSize: 10 }}>
					{store.updatedAt
						? `${store.production ? "נשמר באתר" : "נשמר מקומית"} · ${new Date(store.updatedAt).toLocaleString("he-IL")}`
						: "עותק של הספרייה · מוכן לעריכה מקומית"}
				</Body>
			</View>
			<Row style={{ gap: 6 }}>
				<Button
					$secondary
					disabled={store.loading}
					accessibilityRole="button"
					onPress={onImport}
					style={{ paddingHorizontal: 9, borderWidth: 0 }}
				>
					<Icon name="upload" size={15} />
					<ButtonText $secondary>ייבוא קטלוג</ButtonText>
				</Button>
				<WebLink href={apiUrl("/api/export")} download="catalog.json">
					<Icon name="download" size={15} />
					ייצוא
				</WebLink>
			</Row>
		</Row>
	);
});

export function CatalogLoading() {
	const theme = useTheme();
	return (
		<View style={{ padding: 70, gap: 15 }}>
			<ActivityIndicator color={theme.primary} accessibilityLabel="טוען את הקטלוג" />
			<Body style={{ textAlign: "center" }}>טוענים את התכנים שלכם…</Body>
		</View>
	);
}

export const CatalogStorageNote = observer(function CatalogStorageNote({
	store,
}: {
	store: CatalogStore;
}) {
	return (
		<Row style={{ gap: 9, alignItems: "flex-start" }}>
			<Icon name="info" size={16} />
			<Body style={{ flex: 1, fontSize: 11 }}>
				{store.production
					? "שינויים נשמרים ישירות באתר הספרייה. גרסאות קודמות זמינות בהיסטוריית השינויים."
					: "מרחב לעריכה מקומית. שינויים נשמרים כאן ואפשר לייצא אותם כקטלוג."}
			</Body>
		</Row>
	);
});
