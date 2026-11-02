import { useState } from "react";
import { observer } from "mobx-react-lite";
import styled from "styled-components";
import type { CatalogInput, ImportMode } from "../../models/catalog";
import type { CatalogStore } from "../catalog/CatalogStore";
import { ModalDialog, DialogBody, DialogFooter } from "../../ui/ModalDialog";
import { Field, FormButton, FormError } from "../../ui/browserControls";
import { Icon } from "../../ui/Icon";
import { parseImport } from "../../core/catalogImport";

const Hint = styled.p`
	font: 12px/1.9 ${({ theme }) => theme.font};
	color: ${({ theme }) => theme.muted};
`;
export const ImportDialog = observer(function ImportDialog({
	store,
	open,
	onClose,
}: {
	store: CatalogStore;
	open: boolean;
	onClose(): void;
}) {
	const [catalog, setCatalog] = useState<CatalogInput | null>(null);
	const [mode, setMode] = useState<ImportMode>("merge");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const close = () => {
		if (store.saving || loading) return;
		setCatalog(null);
		setError(null);
		setMode("merge");
		onClose();
	};
	const items = catalog ? (Array.isArray(catalog) ? catalog : catalog.items) : [];
	const count =
		items.filter(
			(item) => mode !== "merge" || !store.items.some((existing) => existing.id === item.id),
		).length ?? 0;
	return (
		<ModalDialog
			open={open}
			title="ייבוא קטלוג"
			description="ייבוא תכנים, ספריות וקישורים מקטלוג משותף. נתמכים גם קובצי הקטלוג הישנים."
			onClose={close}
		>
			<DialogBody>
				<FormButton
					type="button"
					disabled={loading || store.saving}
					onClick={async () => {
						setLoading(true);
						setCatalog(null);
						setError(null);
						try {
							setCatalog(parseImport(await store.readSource()));
						} catch (reason) {
							setError(reason instanceof Error ? reason.message : "הייבוא לא הושלם.");
						} finally {
							setLoading(false);
						}
					}}
				>
					<Icon name="globe" size={17} />
					{loading ? "טוענים מהספרייה…" : "מהספרייה הקיימת"}
				</FormButton>
				<Hint dir="ltr">knowledge.davinci4744.com</Hint>
				<Field>
					מקובץ JSON
					<input
						type="file"
						accept=".json,application/json"
						disabled={loading || store.saving}
						onChange={async (event) => {
							const file = event.target.files?.[0];
							if (!file) return;
							setCatalog(null);
							setError(null);
							try {
								if (file.size > 4 * 1024 * 1024)
									throw new Error("גודל הקובץ המרבי הוא 4MB.");
								setCatalog(parseImport(JSON.parse(await file.text())));
							} catch (reason) {
								setError(
									reason instanceof SyntaxError
										? "הקובץ אינו JSON תקין."
										: reason instanceof Error
											? reason.message
											: "הייבוא לא הושלם.",
								);
							}
							event.target.value = "";
						}}
					/>
				</Field>
				<Field>
					אופן הייבוא
					<select
						value={mode}
						onChange={(event) => setMode(event.target.value as ImportMode)}
					>
						<option value="merge">הוספת תכנים וספריות חדשים</option>
						<option value="overwrite">
							הוספה ועדכון של תכנים, ספריות וקישורים קיימים
						</option>
						<option value="replace">החלפת הקטלוג כולו</option>
					</select>
				</Field>
				{catalog && (
					<Hint role="status">
						{mode === "replace"
							? "הקטלוג יוחלף במלואו, כולל הספריות והקישורים."
							: `${count} תכנים יתווספו או יעודכנו. ספריות וקישורים ייובאו לפי האפשרות שנבחרה.`}{" "}
						גרסה קודמת תישמר בהיסטוריה.
					</Hint>
				)}
				{(error || store.error) && (
					<FormError role="alert">{error || store.error}</FormError>
				)}
			</DialogBody>
			<DialogFooter>
				<FormButton onClick={close} disabled={loading || store.saving}>
					ביטול
				</FormButton>
				<FormButton
					$primary
					disabled={!catalog || loading || store.saving}
					onClick={async () => {
						if (catalog && (await store.importCatalog(catalog, mode))) close();
					}}
				>
					ייבוא קטלוג
				</FormButton>
			</DialogFooter>
		</ModalDialog>
	);
});
