import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import styled from "styled-components";
import type { CatalogStore } from "../catalog/CatalogStore";
import type { EditorStore } from "./EditorStore";
import { ModalDialog, DialogBody, DialogFooter } from "../../ui/ModalDialog";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Check, Field, FormRow, FormButton, FormError } from "../../ui/browserControls";
import { Icon } from "../../ui/Icon";

const Toggle = styled.label`
	display: flex;
	align-items: center;
	gap: 11px;
	padding: 14px;
	margin: 0 0 20px;
	background: ${({ theme }) => theme.background};
	border: 1px solid ${({ theme }) => theme.border};
	border-radius: 7px;
	font: 12px ${({ theme }) => theme.font};
	color: ${({ theme }) => theme.text};
`;
export const EditorDialog = observer(function EditorDialog({
	editor,
	catalog,
}: {
	editor: EditorStore;
	catalog: CatalogStore;
}) {
	const [confirming, setConfirming] = useState<"discard" | "delete" | null>(null);
	useEffect(() => {
		if (!editor.open) return;
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (editor.dirty || catalog.saving) event.preventDefault();
		};
		window.addEventListener("beforeunload", beforeUnload);
		return () => window.removeEventListener("beforeunload", beforeUnload);
	}, [editor, catalog, editor.open]);
	const close = () => {
		if (catalog.saving) return;
		if (editor.dirty) setConfirming("discard");
		else editor.close();
	};
	const draft = editor.draft;
	return (
		<>
			<ModalDialog
				open={editor.open}
				title="עריכת תוכן"
				description={
					catalog.production ? "השמירה מעדכנת את אתר הספרייה" : "נשמר במרחב העבודה המקומי"
				}
				onClose={close}
			>
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						const item = editor.toItem();
						if (await catalog.saveItem(item, item.id)) editor.close();
					}}
				>
					<DialogBody>
						<Field>
							שם התוכן *
							<input
								autoFocus
								required
								maxLength={300}
								value={draft.title}
								onChange={(event) => editor.setField("title", event.target.value)}
							/>
						</Field>
						<Field>
							מזהה תוכן
							<input readOnly dir="ltr" value={editor.original?.id ?? ""} />
							<small>משמש לקישור הקבוע לתוכן.</small>
						</Field>
						<Field>
							תיאור
							<textarea
								rows={3}
								maxLength={10000}
								value={draft.description}
								onChange={(event) =>
									editor.setField("description", event.target.value)
								}
							/>
						</Field>
						<FormRow>
							<Field>
								תחומים
								<textarea
									rows={3}
									maxLength={4020}
									value={draft.topics}
									onChange={(event) =>
										editor.setField("topics", event.target.value)
									}
								/>
								<small>כתבו תחום אחד בכל שורה.</small>
							</Field>
							<Field>
								שיוך לספרייה או לקורס
								<select
									value={draft.gallery}
									onChange={(event) =>
										editor.setField(
											"gallery",
											event.target.value as typeof draft.gallery,
										)
									}
								>
									{catalog.galleries.map((gallery) => (
										<option key={gallery.id} value={gallery.id}>
											{gallery.name}
										</option>
									))}
								</select>
							</Field>
						</FormRow>
						<Toggle>
							<Check
								checked={draft.featured}
								onChange={(event) =>
									editor.setField("featured", event.target.checked)
								}
							/>
							תוכן מומלץ
							<Icon name="star" size={17} />
						</Toggle>
						<Field>
							פרקים
							<textarea
								rows={3}
								placeholder="כל פרק בשורה נפרדת"
								value={draft.chapters}
								onChange={(event) =>
									editor.setField("chapters", event.target.value)
								}
							/>
						</Field>
						{editor.original && (
							<FormButton
								type="button"
								$danger
								disabled={catalog.saving}
								onClick={() => setConfirming("delete")}
							>
								<Icon name="trash" size={14} />
								הסרה מהקטלוג
							</FormButton>
						)}
						{catalog.error && <FormError role="alert">{catalog.error}</FormError>}
					</DialogBody>
					<DialogFooter>
						<FormButton type="button" onClick={close} disabled={catalog.saving}>
							ביטול
						</FormButton>
						<FormButton type="submit" $primary disabled={catalog.saving}>
							<Icon name="check" size={15} color="white" />
							{catalog.saving ? "שומרים…" : "שמירת שינויים"}
						</FormButton>
					</DialogFooter>
				</form>
			</ModalDialog>
			<ConfirmDialog
				open={!!confirming}
				title={confirming === "delete" ? "להסיר את התוכן מהקטלוג?" : "לסגור בלי לשמור?"}
				description={
					confirming === "delete"
						? "הרשומה תוסר מהקטלוג. קובצי המדיה נשמרים, ואפשר לשחזר את הרשומה מההיסטוריה."
						: "יש שינויים שטרם נשמרו בתוכן הזה."
				}
				label={confirming === "delete" ? "הסרה מהקטלוג" : "סגירה בלי לשמור"}
				busy={catalog.saving}
				onClose={() => setConfirming(null)}
				onConfirm={async () => {
					if (confirming === "discard") editor.close();
					else if (editor.original && (await catalog.removeItem(editor.original.id)))
						editor.close();
					setConfirming(null);
				}}
			/>
		</>
	);
});
