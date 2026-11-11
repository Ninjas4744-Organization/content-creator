import { useState } from "react";
import { observer } from "mobx-react-lite";
import {
	isFixedGallery,
	itemGallery,
	type GalleryDefinition,
	type GallerySection,
} from "../../models/catalog";
import type { CatalogStore } from "./CatalogStore";
import { ModalDialog, DialogBody, DialogFooter } from "../../ui/ModalDialog";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Field, FormButton, FormError, WebLink } from "../../ui/browserControls";
import { Icon } from "../../ui/Icon";
import { galleryUrl } from "../../ui/browserMedia";
import { galleryGroups } from "./galleries";

export const GalleryDialog = observer(function GalleryDialog({
	store,
	gallery,
	initialSection,
	onClose,
}: {
	store: CatalogStore;
	gallery?: GalleryDefinition;
	initialSection?: GallerySection;
	onClose(): void;
}) {
	const [name, setName] = useState(gallery?.name ?? "");
	const [url, setUrl] = useState(gallery?.url ?? "/");
	const [section, setSection] = useState<"course" | "">(
		gallery?.section === "course" || initialSection === "course" ? "course" : "",
	);
	const [deleting, setDeleting] = useState(false);
	const fixed = !!gallery && isFixedGallery(gallery.id);
	const addLabel = galleryGroups.find(
		(group) => group.section === (section || undefined),
	)!.addLabel;
	const close = () => {
		if (!store.saving) onClose();
	};
	return (
		<>
			<ModalDialog
				open
				title={
					gallery
						? `${fixed ? "פרטי הספרייה" : "עריכת הספרייה"} ״${gallery.name}״`
						: addLabel
				}
				description={
					fixed
						? "זו ספרייה קבועה. אפשר לשייך אליה תכנים."
						: "קישורי הצפייה בתכנים ייפתחו בכתובת הספרייה."
				}
				onClose={close}
			>
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						if (fixed) return;
						const change = gallery
							? {
									type: "update" as const,
									id: gallery.id,
									name,
									url,
									section:
										section || (gallery.section === "team" ? undefined : null),
								}
							: { type: "create" as const, name, url, section: section || null };
						if (await store.changeGallery(change)) onClose();
					}}
				>
					<DialogBody>
						{!fixed && (
							<>
								<Field>
									שם הספרייה
									<input
										required
										maxLength={100}
										value={name}
										disabled={store.saving}
										onChange={(event) => setName(event.target.value)}
									/>
								</Field>
								<Field>
									אזור באתר
									<select
										value={section}
										disabled={store.saving}
										onChange={(event) =>
											setSection(event.target.value as typeof section)
										}
									>
										{galleryGroups.map(({ section, label }) => (
											<option key={label} value={section ?? ""}>
												{label}
											</option>
										))}
									</select>
									<small>
										בחירה בקורסים מוסיפה את הספרייה לרשימת הקורסים באתר.
									</small>
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
										{section
											? "נתיב באתר שמתחיל ב־/. אפשר להשאיר /."
											: "נתיב באתר או כתובת HTTP/HTTPS מלאה."}
									</small>
								</Field>
							</>
						)}
						{gallery && gallery.id !== "none" && (
							<WebLink
								href={galleryUrl(gallery)}
								target="_blank"
								rel="noopener noreferrer"
							>
								<Icon name="external" size={13} />
								פתיחת הספרייה
							</WebLink>
						)}
						{!deleting && store.error && (
							<FormError role="alert">{store.error}</FormError>
						)}
					</DialogBody>
					<DialogFooter>
						{gallery && !fixed && (
							<FormButton
								type="button"
								$danger
								disabled={store.saving}
								style={{ marginInlineEnd: "auto" }}
								onClick={() => {
									store.setError(null);
									setDeleting(true);
								}}
							>
								מחיקת ספרייה
							</FormButton>
						)}
						<FormButton type="button" disabled={store.saving} onClick={close}>
							{fixed ? "סגירה" : "ביטול"}
						</FormButton>
						{!fixed && (
							<FormButton
								type="submit"
								$primary
								disabled={store.saving || !name.trim() || !url.trim()}
							>
								{store.saving ? "שומרים…" : gallery ? "שמירת שינויים" : addLabel}
							</FormButton>
						)}
					</DialogFooter>
				</form>
			</ModalDialog>
			{deleting && gallery && (
				<ConfirmDialog
					open
					title={`למחוק את הספרייה ״${gallery.name}״?`}
					description={`כל ${store.items.filter((item) => itemGallery(item) === gallery.id).length} התכנים שלה יועברו לבקישור בלבד. אפשר לשחזר את הספרייה ותכניה מהיסטוריית השינויים.`}
					label="מחיקת ספרייה והעברת התכנים"
					busy={store.saving}
					error={store.error}
					onClose={() => {
						if (store.saving) return;
						store.setError(null);
						setDeleting(false);
					}}
					onConfirm={async () => {
						if (await store.changeGallery({ type: "delete", id: gallery.id }))
							onClose();
					}}
				/>
			)}
		</>
	);
});
