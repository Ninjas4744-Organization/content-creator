import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import styled from "styled-components/native";
import {
	isFixedGallery,
	itemGallery,
	type BlossomAssignmentForm,
	type GalleryDefinition,
} from "../../models/catalog";
import type { CatalogStore } from "./CatalogStore";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Field, FormButton, FormRow, WebLink } from "../../ui/browserControls";
import { Body, Label, Row } from "../../ui/primitives";
import { Icon } from "../../ui/Icon";
import { galleryUrl } from "../../ui/browserMedia";

const Settings = styled.View`
	border: 1px solid ${({ theme }) => theme.border};
	border-radius: 10px;
	padding: 20px;
	gap: 10px;
	background-color: ${({ theme }) => theme.surface};
`;

function CourseAssignmentForms({ store, galleryId }: { store: CatalogStore; galleryId: string }) {
	const [forms, setForms] = useState<BlossomAssignmentForm[]>();
	const [error, setError] = useState<string>();
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		let current = true;
		store.blossomAssignmentForms(galleryId).then(
			(result) => {
				if (current) setForms(result);
			},
			(failure: unknown) => {
				if (current)
					setError(failure instanceof Error ? failure.message : "טעינת הטפסים נכשלה.");
			},
		);
		return () => {
			current = false;
		};
	}, [store, galleryId, attempt]);
	if (error)
		return (
			<Row style={{ gap: 10, alignItems: "center" }}>
				<Body>{error}</Body>
				<FormButton
					type="button"
					onClick={() => {
						setError(undefined);
						setAttempt(attempt + 1);
					}}
				>
					טעינה מחדש
				</FormButton>
			</Row>
		);
	if (!forms) return <Body>טוענים את טופסי המטלות…</Body>;
	if (!forms.length) return null;
	return (
		<>
			<Body>פתחו את הטופס של כל שיעור ולחצו Save ב־Blossom פעם אחת.</Body>
			<div>
				{forms.map(({ title, url }, index) => (
					<div key={index}>
						<WebLink href={url} target="_blank" rel="noopener noreferrer">
							<Icon name="external" size={14} />
							פתיחת טופס מטלה עבור {title}
						</WebLink>
					</div>
				))}
			</div>
		</>
	);
}

export const GallerySettings = observer(function GallerySettings({
	store,
	gallery,
	initialCourse = false,
	onCreated,
}: {
	store: CatalogStore;
	gallery?: GalleryDefinition;
	initialCourse?: boolean;
	onCreated?(id: string): void;
}) {
	const [name, setName] = useState(gallery?.name ?? "");
	const [url, setUrl] = useState(gallery?.url ?? "/");
	const [deleting, setDeleting] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [course, setCourse] = useState(gallery?.section === "course" || initialCourse);
	const fixed = !!gallery && isFixedGallery(gallery.id);
	const busy = store.loading || store.saving;
	const section = course ? "course" : gallery?.section === "team" ? "team" : null;
	const isCourse = gallery?.section === "course";
	const lessonCount = isCourse
		? store.items.filter((item) => itemGallery(item) === gallery.id).length
		: 0;
	const courses = store.blossom?.courses;
	const published =
		isCourse && courses && Object.hasOwn(courses, gallery.id) ? courses[gallery.id] : undefined;
	const prepared = published?.workspaceUrl;
	const completed = published && published.assignmentCount === published.lessonCount;
	const dirty =
		gallery &&
		(name !== gallery.name ||
			url !== gallery.url ||
			(section ?? undefined) !== gallery.section);
	const openLibrary = gallery && gallery.id !== "none" && (
		<WebLink href={galleryUrl(gallery)} target="_blank" rel="noopener noreferrer">
			<Icon name="external" size={14} />
			{isCourse ? "פתיחת הקורס בספרייה" : "פתיחת הספרייה"}
		</WebLink>
	);
	return (
		<Settings>
			<Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
				<Label style={{ fontSize: 16 }}>
					{gallery
						? isCourse
							? "הגדרות הקורס"
							: "הגדרות הספרייה"
						: course
							? "הוספת קורס"
							: "הוספת ספרייה"}
				</Label>
				{openLibrary}
			</Row>
			{fixed ? (
				<Body>
					{gallery.name} ·{" "}
					{gallery.id === "none"
						? "התכנים זמינים דרך קישור ישיר."
						: "ספרייה קבועה לתכנים שמוצגים בספריית הלמידה הציבורית."}
				</Body>
			) : (
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						if (busy || !name.trim() || !url.trim()) return;
						if (gallery) {
							await store.changeGallery({
								type: "update",
								id: gallery.id,
								name,
								url,
								section,
							});
							return;
						}
						const previous = store.galleries;
						if (await store.changeGallery({ type: "create", name, url, section })) {
							const added = store.galleries.find(
								({ id }) => !previous.some((entry) => entry.id === id),
							);
							if (added) onCreated?.(added.id);
						}
					}}
				>
					<FormRow>
						<Field>
							{course ? "שם הקורס" : "שם הספרייה"}
							<input
								required
								maxLength={100}
								value={name}
								disabled={busy}
								onChange={(event) => setName(event.target.value)}
							/>
						</Field>
						<Field>
							{course ? "קישור לקורס" : "קישור לספרייה"}
							<input
								required
								dir="ltr"
								inputMode="url"
								maxLength={2000}
								value={url}
								disabled={busy}
								onChange={(event) => setUrl(event.target.value)}
							/>
							<small>
								{course
									? "נתיב באתר שמתחיל ב־/. אפשר להשאיר /."
									: "נתיב באתר, למשל /team-library, או כתובת HTTP/HTTPS מלאה."}
							</small>
						</Field>
						<Field>
							סוג
							<select
								value={course ? "course" : "library"}
								disabled={busy}
								onChange={(event) => setCourse(event.target.value === "course")}
							>
								<option value="library">ספרייה</option>
								<option value="course">קורס</option>
							</select>
						</Field>
					</FormRow>
					<Row style={{ flexWrap: "wrap" }}>
						<FormButton
							type="submit"
							$primary
							disabled={busy || !name.trim() || !url.trim() || (gallery && !dirty)}
						>
							{gallery ? "שמירת שינויים" : course ? "הוספת קורס" : "הוספת ספרייה"}
						</FormButton>
						{gallery && (
							<FormButton
								type="button"
								$danger
								disabled={busy}
								onClick={() => {
									store.setError(null);
									setDeleting(true);
								}}
							>
								{isCourse ? "מחיקת קורס" : "מחיקת ספרייה"}
							</FormButton>
						)}
					</Row>
				</form>
			)}
			{isCourse && courses && (
				<Row style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
					{published && (
						<Body>
							{published.name}
							{published.assignmentCount > 0 &&
								` · ${published.assignmentCount}/${published.lessonCount} מטלות נוצרו בפרסום הקודם`}
						</Body>
					)}
					{prepared && (
						<WebLink href={prepared} target="_blank" rel="noopener noreferrer">
							<Icon name="external" size={14} />
							פתיחת הקורס ב־Blossom
						</WebLink>
					)}
					{!prepared && !completed && (
						<FormButton
							type="button"
							disabled={busy || !!dirty || (!lessonCount && !published)}
							onClick={() => {
								store.setError(null);
								setPublishing(true);
							}}
						>
							{published ? "הכנת טופסי מטלות ב־Blossom" : "יצירת קורס ב־Blossom"}
						</FormButton>
					)}
					{!lessonCount && !published && (
						<Body>שייכו לפחות שיעור אחד כדי ליצור את הקורס ב־Blossom.</Body>
					)}
				</Row>
			)}
			{isCourse && prepared && (
				<CourseAssignmentForms key={gallery.id} store={store} galleryId={gallery.id} />
			)}
			{publishing && isCourse && (
				<ConfirmDialog
					open
					title={published ? "להכין טופסי מטלות ב־Blossom?" : "ליצור קורס ב־Blossom?"}
					description={
						published
							? "הטפסים יוכנו לפי רשימת השיעורים שנשמרה בתחילת הפרסום. כל מטלה תישמר דרך הטופס שלה ב־Blossom."
							: "ייווצר מרחב קורס עבור ״" +
								gallery.name +
								"״ ויוכנו " +
								lessonCount +
								" טופסי מטלות. לחצו Save בכל טופס ב־Blossom כדי ליצור את המטלה."
					}
					busy={store.saving}
					error={store.error}
					label={store.saving ? "מכינים…" : "הכנת טופסי מטלות"}
					onClose={() => {
						if (store.saving) return;
						setPublishing(false);
						store.setError(null);
					}}
					onConfirm={async () => {
						if (await store.publishBlossomCourse(gallery.id)) setPublishing(false);
					}}
				/>
			)}
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
							setDeleting(false);
					}}
				/>
			)}
		</Settings>
	);
});
