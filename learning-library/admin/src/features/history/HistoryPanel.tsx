import { useState } from "react";
import { View } from "react-native";
import { observer } from "mobx-react-lite";
import { useTheme } from "styled-components/native";
import type { CatalogStore } from "../catalog/CatalogStore";
import { Body, Label, Button, ButtonText, Row } from "../../ui/primitives";
import { Icon } from "../../ui/Icon";
import { ConfirmDialog } from "../../ui/ConfirmDialog";

export const HistoryPanel = observer(function HistoryPanel({ store }: { store: CatalogStore }) {
	const theme = useTheme();
	const [restoreId, setRestoreId] = useState<string | null>(null);
	return (
		<View style={{ padding: 24 }}>
			{store.historyLoading ? (
				<Body>טוענים את ההיסטוריה…</Body>
			) : !store.history.length ? (
				<View style={{ alignItems: "center", gap: 12, paddingVertical: 35 }}>
					<Icon name="history" size={32} />
					<Label>כל שינוי מתחיל כאן</Label>
					<Body>30 הגרסאות האחרונות יופיעו כאן אחרי השמירה הראשונה.</Body>
				</View>
			) : (
				store.history.map((entry) => (
					<Row
						key={entry.id}
						style={{
							borderTopWidth: 1,
							borderTopColor: theme.border,
							paddingVertical: 18,
							flexWrap: "wrap",
						}}
					>
						<Icon name="history" />
						<View style={{ flex: 1, minWidth: 160, gap: 6 }}>
							<Label style={{ fontSize: 12 }}>{entry.action}</Label>
							<Body style={{ fontSize: 10 }}>
								{new Date(entry.at).toLocaleString("he-IL")} · גרסה קודמת{" "}
								{entry.revision} · {entry.count} תכנים
							</Body>
						</View>
						<Button
							$secondary
							disabled={store.saving}
							accessibilityRole="button"
							onPress={() => setRestoreId(entry.id)}
						>
							<ButtonText $secondary>שחזור הגרסה הקודמת</ButtonText>
						</Button>
					</Row>
				))
			)}
			<ConfirmDialog
				open={!!restoreId}
				title="לחזור לגרסה הקודמת?"
				description="הספריות, התכנים והשיוך שלהם יוחלפו בגרסה שנבחרה. גם המצב הנוכחי יישמר בהיסטוריה."
				label="שחזור גרסה"
				busy={store.saving}
				onClose={() => {
					if (!store.saving) setRestoreId(null);
				}}
				onConfirm={async () => {
					if (restoreId && (await store.restore(restoreId))) setRestoreId(null);
				}}
			/>
		</View>
	);
});
