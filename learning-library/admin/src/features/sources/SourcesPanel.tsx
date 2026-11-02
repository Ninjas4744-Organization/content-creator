import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { observer } from "mobx-react-lite";
import styled from "styled-components/native";
import type { AlbumInput, PhotoAlbum } from "../../models/sources";
import type { SourcesStore } from "./SourcesStore";
import { sourcePrompt } from "./sourcePrompt";
import { Body, Label, Heading, Row, Button, ButtonText } from "../../ui/primitives";
import { Field, FormButton, FormError, WebLink, Select } from "../../ui/browserControls";
import { ModalDialog, DialogBody, DialogFooter } from "../../ui/ModalDialog";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";

const Card = styled.View`
	background-color: ${({ theme }) => theme.surface};
	border: 1px solid ${({ theme }) => theme.border};
	border-radius: 10px;
	padding: 23px;
	gap: 14px;
`;
const Search = styled.TextInput`
	font-family: ${({ theme }) => theme.font};
	font-size: 13px;
	text-align: right;
	border: 1px solid ${({ theme }) => theme.border};
	background-color: ${({ theme }) => theme.surface};
	border-radius: 6px;
	padding: 12px;
	color: ${({ theme }) => theme.text};
`;
const emptyAlbum = (): AlbumInput => ({
	id: "",
	title: "",
	url: "",
	context: "",
	tags: [],
	enabled: true,
});

export const SourcesPanel = observer(function SourcesPanel({
	store,
	compact,
}: {
	store: SourcesStore;
	compact: boolean;
}) {
	const [editing, setEditing] = useState<AlbumInput | null>(null);
	const [creating, setCreating] = useState(false);
	const [tags, setTags] = useState("");
	const [deleting, setDeleting] = useState<PhotoAlbum | null>(null);
	const [restoreId, setRestoreId] = useState("");
	const [restoring, setRestoring] = useState(false);
	const [prompt, setPrompt] = useState<string | null>(null);
	useEffect(() => {
		void store.load();
	}, [store]);
	const busy = store.loading || store.saving;
	const edit = (album?: PhotoAlbum) => {
		store.clearFeedback();
		setCreating(!album);
		setEditing(album ? { ...album } : emptyAlbum());
		setTags(album?.tags.join(", ") ?? "");
	};
	const save = async () => {
		if (!editing) return;
		const { id, ...fields } = editing;
		const album = {
			...fields,
			tags: tags
				.split(/[,،\n]/)
				.map((tag) => tag.trim())
				.filter(Boolean),
		};
		const saved = await store.change(
			creating ? { type: "create", album } : { type: "update", album: { ...album, id } },
		);
		if (saved) setEditing(null);
	};
	return (
		<>
			<Row style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
				<View style={{ gap: 8, flex: 1, minWidth: 220 }}>
					<Body>חומרי הגלם לרעיונות הבאים שלכם</Body>
					<Heading $compact={compact} accessibilityRole="header">
						מקורות ליצירת תוכן
					</Heading>
					<Body>
						אלבומי התמונות של הקבוצה, עם ההקשר שיעזור לסוכן לבחור תמונות למצגות
						ולסרטונים.
					</Body>
				</View>
				<Button accessibilityRole="button" disabled={busy} onPress={() => edit()}>
					<Icon name="plus" color="white" size={17} />
					<ButtonText>הוספת אלבום</ButtonText>
				</Button>
			</Row>
			<Card>
				<Label>מתחילים מהמקור, יוצרים בהתאם לקונטקסט</Label>
				<Body>
					הוסיפו לכל אלבום תיאור של מה שמופיע בו, נושאים ושימושים מתאימים. הסקילים טוענים
					את המקורות הפעילים מהאתר ובוחרים תמונות לפי נושא התוכן וקהל היעד.
				</Body>
				<Body style={{ fontSize: 11 }}>
					האלבומים צריכים להיות פתוחים לצפייה בקישור משותף של Google Photos. התמונות
					נבחרות ומיובאות במחשב של היוצר.
				</Body>
			</Card>
			{store.error && (
				<View accessibilityRole="alert">
					<FormError>{store.error}</FormError>
					<FormButton disabled={busy} onClick={() => void store.load()}>
						טעינת המקורות מחדש
					</FormButton>
				</View>
			)}
			{store.message && <Body accessibilityLiveRegion="polite">{store.message}</Body>}
			<Row style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
				<Label>אלבומי תמונות · {store.albums.length}</Label>
				<FormButton disabled={busy} onClick={() => void store.load()}>
					<Icon name="refresh" size={15} /> רענון
				</FormButton>
			</Row>
			<Search
				accessibilityLabel="חיפוש מקורות"
				placeholder="חיפוש לפי אלבום, הקשר או תגית…"
				value={store.query}
				onChangeText={store.setQuery}
			/>
			{store.loading ? (
				<ActivityIndicator accessibilityLabel="טוענים מקורות" />
			) : (
				<Row style={{ flexWrap: "wrap", alignItems: "stretch", gap: 18 }}>
					{store.visibleAlbums.map((album) => (
						<Card
							key={album.id}
							style={{
								width: compact ? "100%" : "47%",
								flexGrow: 1,
								maxWidth: compact ? undefined : 620,
							}}
						>
							<Row
								style={{
									justifyContent: "space-between",
									alignItems: "flex-start",
									gap: 15,
								}}
							>
								<View style={{ gap: 7, flex: 1 }}>
									<Label style={{ fontSize: 16 }}>{album.title}</Label>
									<Body style={{ fontSize: 10 }}>
										{album.enabled
											? "פעיל · זמין לסקילים"
											: "מושבת · אינו מוצע לסקילים"}
									</Body>
								</View>
								<Icon name="image" size={23} />
							</Row>
							<Body>
								{album.context ||
									"עדיין לא נוסף הקשר לאלבום. הוסיפו תיאור שיעזור לבחור תמונות מתאימות."}
							</Body>
							{album.tags.length > 0 && (
								<Body style={{ fontSize: 11 }}>{album.tags.join(" · ")}</Body>
							)}
							<WebLink href={album.url} target="_blank" rel="noopener noreferrer">
								<Icon name="external" size={15} />
								פתיחת האלבום
							</WebLink>
							<Row style={{ flexWrap: "wrap", gap: 8 }}>
								<FormButton disabled={busy} onClick={() => edit(album)}>
									עריכה
								</FormButton>
								<FormButton
									$danger
									disabled={busy}
									onClick={() => {
										store.clearFeedback();
										setDeleting(album);
									}}
								>
									הסרה
								</FormButton>
								{album.enabled && (
									<>
										<FormButton
											onClick={() => setPrompt(sourcePrompt(album, "deck"))}
										>
											יצירת מצגת
										</FormButton>
										<FormButton
											onClick={() => setPrompt(sourcePrompt(album, "video"))}
										>
											יצירת סרטון
										</FormButton>
									</>
								)}
							</Row>
						</Card>
					))}
					{store.visibleAlbums.length === 0 && (
						<Body>
							{store.albums.length
								? "לא נמצאו מקורות שמתאימים לחיפוש."
								: "אין עדיין אלבומים. הוסיפו את המקור הראשון שלכם."}
						</Body>
					)}
				</Row>
			)}
			{store.history.length > 0 && (
				<Card>
					<Label>היסטוריית מקורות</Label>
					<Body>אפשר לשחזר אחת מ־30 הגרסאות האחרונות. גם המצב הנוכחי יישמר לשחזור.</Body>
					<Row style={{ flexWrap: "wrap", gap: 10 }}>
						<Select
							aria-label="גרסת מקורות לשחזור"
							value={restoreId}
							onChange={(event) => setRestoreId(event.target.value)}
							style={{ maxWidth: "100%" }}
						>
							<option value="">בחירת גרסה</option>
							{store.history.map((entry) => (
								<option key={entry.id} value={entry.id}>
									{new Date(entry.at).toLocaleString("he-IL")} · {entry.action} ·{" "}
									{entry.count} אלבומים
								</option>
							))}
						</Select>
						<FormButton
							disabled={busy || !restoreId}
							onClick={() => {
								store.clearFeedback();
								setRestoring(true);
							}}
						>
							שחזור גרסה
						</FormButton>
					</Row>
				</Card>
			)}
			{editing && (
				<ModalDialog
					open
					title={creating ? "הוספת אלבום תמונות" : "עריכת מקור"}
					description="תארו מה מופיע באלבום ובאילו נושאים הוא יכול לתמוך."
					onClose={() => {
						if (!store.saving) setEditing(null);
					}}
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void save();
						}}
					>
						<DialogBody>
							<Field>
								שם האלבום
								<input
									required
									maxLength={300}
									value={editing.title}
									onChange={(event) =>
										setEditing({ ...editing, title: event.target.value })
									}
								/>
							</Field>

							<Field>
								קישור משותף של Google Photos
								<input
									required
									type="url"
									dir="ltr"
									maxLength={2000}
									value={editing.url}
									onChange={(event) =>
										setEditing({ ...editing, url: event.target.value })
									}
								/>
							</Field>
							<Field>
								הקשר ושימושים מתאימים
								<textarea
									rows={4}
									maxLength={2000}
									placeholder="מה רואים בתמונות? לאילו נושאים, אירועים או הסברים הן מתאימות?"
									value={editing.context}
									onChange={(event) =>
										setEditing({ ...editing, context: event.target.value })
									}
								/>
							</Field>
							<Field>
								תגיות
								<input
									placeholder="רובוטיקה, עבודת צוות, תחרות"
									value={tags}
									onChange={(event) => setTags(event.target.value)}
								/>
								<small>הפרידו בין תגיות בפסיקים.</small>
							</Field>
							<Field>
								<span>
									<input
										type="checkbox"
										style={{ width: "auto" }}
										checked={editing.enabled}
										onChange={(event) =>
											setEditing({
												...editing,
												enabled: event.target.checked,
											})
										}
									/>{" "}
									זמין לסקילים ליצירת תוכן
								</span>
							</Field>
							{store.error && <FormError role="alert">{store.error}</FormError>}
						</DialogBody>
						<DialogFooter>
							<FormButton
								type="button"
								disabled={store.saving}
								onClick={() => setEditing(null)}
							>
								ביטול
							</FormButton>
							<FormButton $primary type="submit" disabled={store.saving}>
								{store.saving ? "שומרים…" : "שמירת אלבום"}
							</FormButton>
						</DialogFooter>
					</form>
				</ModalDialog>
			)}
			<ConfirmDialog
				open={Boolean(deleting)}
				title="הסרת אלבום מהמקורות"
				description={`להסיר את ״${deleting?.title ?? ""}״? האלבום ב־Google ותמונות שכבר שולבו בתכנים יישארו כפי שהם.`}
				label="הסרת אלבום"
				busy={store.saving}
				error={store.error}
				onClose={() => {
					if (!store.saving) setDeleting(null);
				}}
				onConfirm={async () => {
					if (deleting && (await store.change({ type: "delete", id: deleting.id })))
						setDeleting(null);
				}}
			/>
			<ConfirmDialog
				open={restoring}
				title="שחזור מקורות"
				description="רשימת האלבומים וההקשרים תוחלף בגרסה שנבחרה. המצב הנוכחי יישמר בהיסטוריה."
				label="שחזור מקורות"
				busy={store.saving}
				error={store.error}
				onClose={() => {
					if (!store.saving) setRestoring(false);
				}}
				onConfirm={async () => {
					if (await store.change({ type: "restore", id: restoreId })) {
						setRestoring(false);
						setRestoreId("");
					}
				}}
			/>
			{prompt && (
				<ModalDialog
					open
					title="יוצרים עם המקור שבחרתם"
					description="העתיקו את הבקשה לסוכן שבו פתחתם את ערכת היצירה, והשלימו נושא וקהל יעד."
					onClose={() => setPrompt(null)}
				>
					<DialogBody>
						<Field>
							בקשה לסוכן
							<textarea readOnly rows={9} value={prompt} />
						</Field>
					</DialogBody>
					<DialogFooter>
						<FormButton onClick={() => setPrompt(null)}>סיום</FormButton>
					</DialogFooter>
				</ModalDialog>
			)}
		</>
	);
});
