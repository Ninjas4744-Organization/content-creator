import { useState } from "react";
import { Image, View } from "react-native";
import { observer } from "mobx-react-lite";
import styled from "styled-components/native";
import type { ContentBackground, BackgroundInput, BackgroundAsset } from "../../models/sources";
import type { SourcesStore } from "./SourcesStore";
import { apiUrl } from "../../core/browserRepository";
import { Body, Label, Row, Button, ButtonText } from "../../ui/primitives";
import { Field, FormButton, FormError } from "../../ui/browserControls";
import { ModalDialog, DialogBody, DialogFooter } from "../../ui/ModalDialog";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";

const Card = styled.View`
	background-color: ${({ theme }) => theme.surface};
	border: 1px solid ${({ theme }) => theme.border};
	border-radius: 10px;
	overflow: hidden;
`;
const assetUrl = (asset: BackgroundAsset) => apiUrl("/api/creator/background-assets/" + asset.file);
interface Draft {
	id?: string;
	name: string;
	description: string;
	enabled: boolean;
	image?: BackgroundAsset;
	coverImage?: BackgroundAsset;
}

export const BackgroundsPanel = observer(function BackgroundsPanel({
	store,
	compact,
}: {
	store: SourcesStore;
	compact: boolean;
}) {
	const [draft, setDraft] = useState<Draft | null>(null);
	const [deleting, setDeleting] = useState<ContentBackground | null>(null);
	const busy = store.loading || store.saving || store.uploading;
	const edit = (background?: ContentBackground) => {
		store.clearFeedback();
		setDraft(background ? { ...background } : { name: "", description: "", enabled: true });
	};
	const upload = async (file: File | undefined, field: "image" | "coverImage") => {
		if (!file) return;
		if (file.size > 8 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(file.type)) {
			store.setError("בחרו תמונת PNG או JPEG עד 8MB.");
			return;
		}
		try {
			const asset = await store.uploadBackground(await file.arrayBuffer(), file.type);
			if (asset) setDraft((current) => (current ? { ...current, [field]: asset } : current));
		} catch {
			store.setError("לא הצלחנו לקרוא את קובץ התמונה.");
		}
	};
	const save = async () => {
		if (!draft?.image) return;
		const background: BackgroundInput = {
			name: draft.name.trim(),
			description: draft.description.trim(),
			image: draft.image,
			enabled: draft.enabled,
			...(draft.coverImage ? { coverImage: draft.coverImage } : {}),
		};
		if (
			await store.change(
				draft.id
					? { type: "update-background", background: { ...background, id: draft.id } }
					: { type: "create-background", background },
			)
		)
			setDraft(null);
	};
	return (
		<View style={{ gap: 20 }}>
			<Row style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
				<View style={{ gap: 8, flex: 1 }}>
					<Label style={{ fontSize: 20 }}>רקעים לתוכן · {store.backgrounds.length}</Label>
					<Body>
						כל מצגת וסרטון חדשים מקבלים רקע. האייג׳נט בוחר לפי השם, התיאור והקונטקסט של
						התוכן, או לפי ההתאמה החזותית.
					</Body>
				</View>
				<Button disabled={busy} accessibilityRole="button" onPress={() => edit()}>
					<Icon name="plus" color="white" size={17} />
					<ButtonText>הוספת רקע</ButtonText>
				</Button>
			</Row>
			<Row style={{ flexWrap: "wrap", alignItems: "stretch", gap: 18 }}>
				{store.visibleBackgrounds.map((background) => (
					<Card
						key={background.id}
						style={{
							width: compact ? "100%" : "47%",
							flexGrow: 1,
							maxWidth: compact ? undefined : 620,
						}}
					>
						<Image
							source={{ uri: assetUrl(background.image) }}
							style={{ width: "100%", aspectRatio: 16 / 9 }}
							resizeMode="cover"
							accessibilityLabel={`רקע: ${background.name}`}
						/>
						<View style={{ padding: 20, gap: 12 }}>
							<Row style={{ justifyContent: "space-between", gap: 10 }}>
								<Label style={{ fontSize: 17, flex: 1 }}>{background.name}</Label>
								<Body style={{ fontSize: 10 }}>
									{background.enabled ? "פעיל" : "מושבת"}
								</Body>
							</Row>
							<Body>{background.description}</Body>
							{background.coverImage && (
								<Row style={{ gap: 12 }}>
									<Image
										source={{ uri: assetUrl(background.coverImage) }}
										style={{ width: 112, aspectRatio: 16 / 9, borderRadius: 5 }}
										accessibilityLabel={`רקע פתיחה: ${background.name}`}
									/>
									<Body style={{ flex: 1, fontSize: 11 }}>
										כולל תמונה נפרדת לשקף הפתיחה
									</Body>
								</Row>
							)}
							<Row style={{ flexWrap: "wrap", gap: 8 }}>
								<FormButton disabled={busy} onClick={() => edit(background)}>
									עריכת רקע
								</FormButton>
								<FormButton
									disabled={busy || store.backgrounds.length === 1}
									$danger
									onClick={() => {
										store.clearFeedback();
										setDeleting(background);
									}}
								>
									הסרה
								</FormButton>
							</Row>
						</View>
					</Card>
				))}
				{!store.loading && !store.visibleBackgrounds.length && (
					<Body>לא נמצאו רקעים שמתאימים לחיפוש.</Body>
				)}
			</Row>
			{draft && (
				<ModalDialog
					open
					title={draft.id ? "עריכת רקע" : "הוספת רקע לתוכן"}
					description="השם והתיאור עוזרים לאייג׳נט לבחור את הרקע שמתאים לנושא ולקהל היעד."
					onClose={() => {
						if (!busy) setDraft(null);
					}}
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void save();
						}}
					>
						<DialogBody>
							<fieldset
								disabled={busy}
								style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
							>
								<Field>
									שם הרקע
									<input
										required
										maxLength={160}
										value={draft.name}
										onChange={(event) =>
											setDraft({ ...draft, name: event.target.value })
										}
									/>
								</Field>
								<Field>
									תיאור והתאמה לתוכן
									<textarea
										required
										rows={4}
										maxLength={2000}
										placeholder="מה הסגנון של הרקע? לאילו נושאים ולקהלים הוא מתאים?"
										value={draft.description}
										onChange={(event) =>
											setDraft({ ...draft, description: event.target.value })
										}
									/>
								</Field>
								<Field>
									תמונת רקע
									<input
										aria-label="העלאת תמונת רקע"
										type="file"
										accept="image/png,image/jpeg"
										onChange={(event) =>
											void upload(event.target.files?.[0], "image")
										}
									/>
									<small>
										PNG או JPEG עד 8MB. מומלץ יחס 16:9 ואזור פנוי לקריאת הטקסט.
									</small>
								</Field>
								{draft.image && (
									<Image
										source={{ uri: assetUrl(draft.image) }}
										style={{
											width: "100%",
											aspectRatio: 16 / 9,
											borderRadius: 6,
											marginBottom: 20,
										}}
										resizeMode="contain"
										accessibilityLabel="תצוגת הרקע שהועלה"
									/>
								)}
								<Field>
									תמונה לשקף הפתיחה · אופציונלי
									<input
										aria-label="העלאת רקע פתיחה"
										type="file"
										accept="image/png,image/jpeg"
										onChange={(event) =>
											void upload(event.target.files?.[0], "coverImage")
										}
									/>
									<small>
										כשלא בוחרים תמונה נוספת, אותו רקע משמש לכל השקפים.
									</small>
								</Field>
								{draft.coverImage && (
									<View style={{ gap: 8, marginBottom: 18 }}>
										<Image
											source={{ uri: assetUrl(draft.coverImage) }}
											style={{
												width: "100%",
												aspectRatio: 16 / 9,
												borderRadius: 6,
											}}
											resizeMode="contain"
											accessibilityLabel="תצוגת רקע הפתיחה שהועלה"
										/>
										<FormButton
											type="button"
											onClick={() =>
												setDraft({ ...draft, coverImage: undefined })
											}
										>
											שימוש באותה תמונה גם בפתיחה
										</FormButton>
									</View>
								)}
								<Field>
									<span>
										<input
											type="checkbox"
											style={{ width: "auto" }}
											checked={draft.enabled}
											onChange={(event) =>
												setDraft({
													...draft,
													enabled: event.target.checked,
												})
											}
										/>{" "}
										זמין לבחירה על ידי האייג׳נט
									</span>
									<small>חייב להישאר לפחות רקע פעיל אחד.</small>
								</Field>
							</fieldset>
							{store.uploading && (
								<Body accessibilityLiveRegion="polite">מעלים את התמונה…</Body>
							)}
							{store.error && <FormError role="alert">{store.error}</FormError>}
						</DialogBody>
						<DialogFooter>
							<FormButton
								type="button"
								disabled={busy}
								onClick={() => setDraft(null)}
							>
								ביטול
							</FormButton>
							<FormButton $primary type="submit" disabled={busy || !draft.image}>
								{store.saving ? "שומרים…" : "שמירת רקע"}
							</FormButton>
						</DialogFooter>
					</form>
				</ModalDialog>
			)}
			<ConfirmDialog
				open={Boolean(deleting)}
				title="הסרת רקע"
				description={`להסיר את ״${deleting?.name ?? ""}״ מהרקעים לבחירה? תכנים קיימים וגרסאות קודמות ימשיכו לשמור את התמונות שלהם.`}
				label="הסרת רקע"
				busy={store.saving}
				error={store.error}
				onClose={() => {
					if (!store.saving) setDeleting(null);
				}}
				onConfirm={async () => {
					if (
						deleting &&
						(await store.change({ type: "delete-background", id: deleting.id }))
					)
						setDeleting(null);
				}}
			/>
		</View>
	);
});
