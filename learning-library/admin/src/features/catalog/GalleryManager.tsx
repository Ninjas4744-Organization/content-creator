import { useRef, useState } from "react";
import { View } from "react-native";
import { observer } from "mobx-react-lite";
import { isFixedGallery, itemGallery, type GalleryDefinition } from "../../models/catalog";
import type { CatalogStore } from "./CatalogStore";
import { ModalDialog, DialogBody, DialogFooter } from "../../ui/ModalDialog";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Field, FormButton, FormError, IconButton, WebLink } from "../../ui/browserControls";
import { Body, Label, Row } from "../../ui/primitives";
import { Icon } from "../../ui/Icon";
import { galleryUrl } from "../../ui/browserMedia";

export const GalleryManager = observer(function GalleryManager({
	store,
	open,
	onClose,
}: {
	store: CatalogStore;
	open: boolean;
	onClose(): void;
}) {
	const [editing, setEditing] = useState<GalleryDefinition | null>(null);
	const [name, setName] = useState("");
	const [url, setUrl] = useState("/");
	const [deleting, setDeleting] = useState<GalleryDefinition | null>(null);
	const nameInput = useRef<HTMLInputElement>(null);
	const reset = () => {
		setEditing(null);
		setName("");
		setUrl("/");
	};
	return (
		<>
			<ModalDialog
				open={open}
				title="ניהול ספריות"
				description="צרו ספריות וערכו את השם והקישור שלהן. ספרייה ציבורית ובקישור בלבד הן ספריות קבועות."
				onClose={() => {
					if (!store.saving) onClose();
				}}
			>
				<DialogBody>
					<form
						onSubmit={async (event) => {
							event.preventDefault();
							const change = editing
								? { type: "update" as const, id: editing.id, name, url }
								: { type: "create" as const, name, url };
							if (await store.changeGallery(change)) reset();
						}}
					>
						<Field>
							{editing ? `שם הספרייה: ${editing.name}` : "שם הספרייה החדשה"}
							<input
								ref={nameInput}
								required
								maxLength={100}
								value={name}
								disabled={store.saving}
								onChange={(event) => setName(event.target.value)}
							/>
						</Field>
						<Field>
							קישור לספרייה
							<input
								required
								aria-label="קישור לספרייה"
								dir="ltr"
								inputMode="url"
								maxLength={2000}
								placeholder="/team-library"
								value={url}
								disabled={store.saving}
								onChange={(event) => setUrl(event.target.value)}
							/>
							<small>
								נתיב באתר, למשל /team-library, או כתובת HTTP/HTTPS מלאה. קישורי
								הצפייה בתכנים ייפתחו בכתובת הזו.
							</small>
						</Field>
						<Row style={{ marginBottom: 22 }}>
							<FormButton
								type="submit"
								$primary
								disabled={store.saving || !name.trim() || !url.trim()}
							>
								{store.saving
									? "שומרים…"
									: editing
										? "שמירת שינויים"
										: "הוספת ספרייה"}
							</FormButton>
							{editing && (
								<FormButton type="button" disabled={store.saving} onClick={reset}>
									ביטול עריכה
								</FormButton>
							)}
						</Row>
					</form>
					<View style={{ gap: 18 }}>
						{store.galleries.map((gallery) => (
							<Row key={gallery.id} style={{ gap: 8 }}>
								<View style={{ flex: 1, gap: 4, minWidth: 0 }}>
									<Label style={{ fontSize: 13 }}>{gallery.name}</Label>
									<Body style={{ fontSize: 11 }}>
										{
											store.items.filter(
												(item) => itemGallery(item) === gallery.id,
											).length
										}{" "}
										תכנים
										{isFixedGallery(gallery.id) ? " · ספרייה קבועה" : ""}
									</Body>
									{gallery.id !== "none" && (
										<WebLink
											href={galleryUrl(gallery)}
											target="_blank"
											rel="noopener noreferrer"
											aria-label={`פתיחת הספרייה ${gallery.name}`}
											style={{
												alignSelf: "flex-start",
												maxWidth: "100%",
												overflowWrap: "anywhere",
											}}
										>
											<Icon name="external" size={13} />{" "}
											<span dir="ltr">{gallery.url}</span>
										</WebLink>
									)}
								</View>
								{!isFixedGallery(gallery.id) && (
									<>
										<IconButton
											aria-label={`עריכת הספרייה ${gallery.name}`}
											disabled={store.saving}
											onClick={() => {
												store.setError(null);
												setEditing(gallery);
												setName(gallery.name);
												setUrl(gallery.url);
												nameInput.current?.focus();
												nameInput.current?.scrollIntoView({
													block: "center",
												});
											}}
										>
											<Icon name="edit" size={17} />
										</IconButton>
										<IconButton
											aria-label={`מחיקת הספרייה ${gallery.name}`}
											disabled={store.saving}
											onClick={() => {
												store.setError(null);
												setDeleting(gallery);
											}}
										>
											<Icon name="trash" size={17} />
										</IconButton>
									</>
								)}
							</Row>
						))}
					</View>
					{store.error && <FormError role="alert">{store.error}</FormError>}
				</DialogBody>
				<DialogFooter>
					<FormButton disabled={store.saving} onClick={onClose}>
						סיום
					</FormButton>
				</DialogFooter>
			</ModalDialog>
			<ConfirmDialog
				open={!!deleting}
				title={`למחוק את הספרייה ״${deleting?.name ?? ""}״?`}
				description={`כל ${store.items.filter((item) => itemGallery(item) === deleting?.id).length} התכנים שלה יועברו לבקישור בלבד. אפשר לשחזר את הספרייה ותכניה מהיסטוריית השינויים.`}
				label="מחיקת ספרייה והעברת התכנים"
				busy={store.saving}
				onClose={() => {
					if (!store.saving) setDeleting(null);
				}}
				onConfirm={async () => {
					if (
						deleting &&
						(await store.changeGallery({ type: "delete", id: deleting.id }))
					) {
						if (editing?.id === deleting.id) reset();
					}
					setDeleting(null);
				}}
			/>
		</>
	);
});
