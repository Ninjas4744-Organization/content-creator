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
const Media = styled.details`
	border-top: 1px solid ${({ theme }) => theme.border};
	padding-top: 18px;
	summary {
		font: 13px ${({ theme }) => theme.font};
		color: ${({ theme }) => theme.text};
		margin-bottom: 18px;
	}
	p {
		font: 11px/1.8 ${({ theme }) => theme.font};
		color: ${({ theme }) => theme.muted};
	}
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
				title={editor.original ? "עריכת תוכן" : "תוכן חדש בספרייה"}
				description={
					catalog.production ? "השמירה מעדכנת את אתר הספרייה" : "נשמר במרחב העבודה המקומי"
				}
				onClose={close}
			>
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						if (await catalog.saveItem(editor.toItem(), editor.original?.id))
							editor.close();
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
							מזהה תוכן *
							<input
								required
								readOnly={!!editor.original}
								pattern="[A-Za-z0-9_-]+"
								maxLength={120}
								dir="ltr"
								value={draft.id}
								onChange={(event) => editor.setField("id", event.target.value)}
							/>
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
								קטגוריה *
								<input
									required
									maxLength={200}
									list="editor-categories"
									value={draft.category}
									onChange={(event) =>
										editor.setField("category", event.target.value)
									}
								/>
								<datalist id="editor-categories">
									{catalog.categories
										.filter((category) => category !== "הכול")
										.map((category) => (
											<option key={category} value={category} />
										))}
								</datalist>
							</Field>
							<Field>
								מופיע בספרייה
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
						<Media open={!editor.original || undefined}>
							<summary>מדיה וקבצים</summary>
							<p>
								קישורים לקבצים שכבר קיימים בספרייה. העלאת קבצים ויצירת תוכן יתווספו
								בנפרד.
							</p>
							{(
								[
									["poster", "תמונת שער"],
									["deck", "מצגת לצפייה"],
									["video", "נגן וידאו"],
									["powerpoint", "קובץ PowerPoint"],
									["scormDeck", "SCORM — מצגת"],
									["scormVideo", "SCORM — וידאו"],
								] as const
							).map(([key, label]) => (
								<Field key={key}>
									{label}
									<input
										dir="ltr"
										value={draft[key]}
										onChange={(event) =>
											editor.setField(key, event.target.value)
										}
									/>
								</Field>
							))}
							<FormRow>
								{(
									[
										["slides", "מספר שקפים"],
										["duration", "משך וידאו (שניות)"],
										["checkpoints", "שאלות חזרה"],
									] as const
								).map(([key, label]) => (
									<Field key={key}>
										{label}
										<input
											type="number"
											min="0"
											max={key === "duration" ? 1000000 : 100000}
											step={key === "duration" ? "any" : "1"}
											value={draft[key]}
											onChange={(event) =>
												editor.setField(key, event.target.value)
											}
										/>
									</Field>
								))}
							</FormRow>
						</Media>
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
