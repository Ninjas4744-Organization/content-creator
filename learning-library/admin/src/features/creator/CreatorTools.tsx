import { useState } from "react";
import { View } from "react-native";
import { ModalDialog, DialogBody, DialogFooter } from "../../ui/ModalDialog";
import { Body, Label, Row } from "../../ui/primitives";
import { Field, FormButton, WebLink } from "../../ui/browserControls";
import { Icon } from "../../ui/Icon";
import { apiUrl } from "../../core/browserRepository";

const actions = [
	{
		label: "יצירת מצגת",
		skill: "davinci-presentation",
		request: "צור מצגת בנושא [הנושא שלי] לקהל [קהל היעד].",
	},
	{
		label: "יצירת סרטון אינטראקטיבי",
		skill: "davinci-interactive-video",
		request: "צור סרטון אינטראקטיבי בנושא [הנושא שלי] לקהל [קהל היעד].",
	},
	{
		label: "ייבוא תוכן קיים",
		skill: "davinci-import",
		request: "ייבא את [קובץ המקור או שם הפריט בספרייה] לפרויקט מקומי.",
	},
] as const;

const clients = [
	{ name: "ChatGPT (Codex)", prefix: "$", url: "codex://threads/new?prompt=" },
	{ name: "Claude Code", prefix: "/", url: "claude://code/new?q=" },
] as const;

function ClientPrompt({
	action,
	client,
}: {
	action: (typeof actions)[number];
	client: (typeof clients)[number];
}) {
	const prompt = `${client.prefix}${action.skill} ${action.request}`;
	const [feedback, setFeedback] = useState("");
	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(prompt);
			setFeedback("הפרומפט הועתק.");
		} catch {
			setFeedback("אפשר לבחור את הטקסט בשדה ולהעתיק אותו ידנית.");
		}
	}
	return (
		<View style={{ gap: 7 }}>
			<Field style={{ marginBottom: 0 }}>
				<bdi>{client.name}</bdi>
				<textarea dir="ltr" readOnly rows={2} value={prompt} />
			</Field>
			<Row style={{ gap: 8, flexWrap: "wrap" }}>
				<WebLink href={`${client.url}${encodeURIComponent(prompt)}`}>
					<Icon name="external" size={15} /> פתיחת <bdi>{client.name}</bdi> במחשב
				</WebLink>
				<FormButton
					type="button"
					aria-label={`העתקת פרומפט עבור ${client.name}`}
					onClick={() => void copyPrompt()}
				>
					העתקת פרומפט
				</FormButton>
			</Row>
			{feedback && <Body accessibilityLiveRegion="polite">{feedback}</Body>}
		</View>
	);
}

export function CreatorTools({ production, onClose }: { production: boolean; onClose(): void }) {
	const [action, setAction] = useState<(typeof actions)[number]>(actions[0]);
	return (
		<ModalDialog
			open
			title="הוספת תוכן באמצעות AI"
			description="בחרו מה ליצור או לייבא והמשיכו באפליקציה במחשב."
			onClose={onClose}
		>
			<DialogBody>
				<View style={{ gap: 22 }}>
					<Row style={{ gap: 8, flexWrap: "wrap" }}>
						{actions.map((option) => (
							<FormButton
								key={option.skill}
								type="button"
								$primary={action === option}
								aria-pressed={action === option}
								onClick={() => setAction(option)}
							>
								{option.label}
							</FormButton>
						))}
					</Row>
					<View style={{ gap: 7 }}>
						<Body>
							בפעם הראשונה הורידו וחלצו את ערכת היצירה. באפליקציה בחרו בתיקייה
							שחילצתם, החליפו את הטקסט בסוגריים בפרטים שלכם ושלחו את הפרומפט.
						</Body>
						<WebLink
							href={apiUrl("/api/creator/kit")}
							download="davinci-creator.zip"
							style={{ alignSelf: "flex-start" }}
						>
							<Icon name="download" size={16} /> הורדת ערכת היצירה והסקילים
						</WebLink>
					</View>
					{clients.map((client) => (
						<ClientPrompt
							key={`${action.skill}-${client.prefix}`}
							action={action}
							client={client}
						/>
					))}
					<View style={{ gap: 7 }}>
						<Label>בודקים ומפרסמים</Label>
						<Body>
							אחרי שבדקתם את התוצר, בקשו מהסוכן לפרסם אותו בספרייה הרצויה. התחברו
							בדפדפן עם החשבון המורשה שלכם. התוכן יופיע באתר בטעינה הבאה, ואפשר להמשיך
							לנהל אותו כאן.
						</Body>
					</View>
					<View style={{ gap: 7 }}>
						<Label>יוצרים מתוך המקורות שלכם</Label>
						<Body>
							ב״ניהול מקורות״ אפשר לנהל אלבומי תמונות וערכות נושא. הוסיפו שם ותיאור
							לכל רקע כדי לכוון את הבחירה של הסוכן. סקילי המצגות והסרטונים טוענים את
							המקורות הפעילים מהאתר, בוחרים תמונות בהתאם לקונטקסט וחייבים לבחור רקע
							לכל תוכן חדש. אפשר להעתיק בקשת יצירה מכרטיס אלבום.
						</Body>
					</View>
					<View style={{ gap: 7 }}>
						<Label>מעדכנים בלי להוריד הכול ידנית</Label>
						<Body>
							בקשו מהסוכן להשתמש בסקיל <bdi>davinci-update</bdi>. הוא יעדכן את הסקילים
							והכלים מהאתר וישמור על הפרויקטים והעריכות המקומיות שלכם.
						</Body>
					</View>
					<Body style={{ fontSize: 11 }}>
						הסוכן יתקין Python וכלים חסרים לפי הצורך, בכפוף להרשאות במחשב. אין צורך
						בחשבון Git או במפתחות Cloudflare. החיבור לאתר אישי; שירותי AI וקריינות
						משתמשים בחשבון שלכם בנפרד.
					</Body>
					{!production && (
						<Body style={{ fontSize: 11 }}>
							זהו אדמין מקומי. הורדת הערכה זמינה כאן; פרסום התוכן נעשה באתר באמצעות
							החשבון המורשה שלכם.
						</Body>
					)}
				</View>
			</DialogBody>
			<DialogFooter>
				<FormButton onClick={onClose}>סיום</FormButton>
			</DialogFooter>
		</ModalDialog>
	);
}
