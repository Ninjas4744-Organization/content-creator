import { View } from "react-native";
import { ModalDialog, DialogBody, DialogFooter } from "../../ui/ModalDialog";
import { Body, Label } from "../../ui/primitives";
import { Field, FormButton, WebLink } from "../../ui/browserControls";
import { Icon } from "../../ui/Icon";
import { apiUrl } from "../../core/browserRepository";

export function CreatorTools({ production, onClose }: { production: boolean; onClose(): void }) {
	return (
		<ModalDialog
			open
			title="יוצרים עם סוכן ה־AI שלכם"
			description="הורידו את הסקילים וכלי היצירה, צרו תוכן במחשב ופרסמו אותו בספרייה דרך החשבון שלכם."
			onClose={onClose}
		>
			<DialogBody>
				<View style={{ gap: 22 }}>
					<View style={{ gap: 7 }}>
						<Label>1 · מורידים את ערכת היצירה</Label>
						<Body>
							הערכה כוללת סקילים למצגות, סרטונים, פרסום ועדכון הסקילים, יחד עם כלי
							היצירה, הגופנים והמיתוג של הקבוצה.
						</Body>
						<WebLink
							href={apiUrl("/api/creator/kit")}
							download="davinci-creator.zip"
							style={{ alignSelf: "flex-start" }}
						>
							<Icon name="download" size={16} /> הורדת ערכת היצירה והסקילים
						</WebLink>
					</View>
					<View style={{ gap: 7 }}>
						<Label>2 · פותחים את התיקייה עם הסוכן</Label>
						<Body>
							חלצו את ה־ZIP ופתחו את התיקייה בסוכן שיכול לקרוא קבצים ולהריץ Python
							במחשב. בחרו את הסקיל המתאים והוסיפו את הנושא וקהל היעד שלכם:
						</Body>
						<Field>
							יצירת מצגת · $davinci-presentation
							<textarea
								readOnly
								rows={3}
								value="$davinci-presentation צור מצגת בנושא [הנושא שלי] לקהל [קהל היעד]."
							/>
						</Field>
						<Field>
							יצירת סרטון אינטראקטיבי · $davinci-interactive-video
							<textarea
								readOnly
								rows={3}
								value="$davinci-interactive-video צור סרטון אינטראקטיבי בנושא [הנושא שלי] לקהל [קהל היעד]."
							/>
						</Field>
					</View>
					<View style={{ gap: 7 }}>
						<Label>3 · בודקים ומפרסמים</Label>
						<Body>
							אחרי שבדקתם את התוצר, בקשו מהסוכן לפרסם אותו בספרייה הרצויה. התחברו
							בדפדפן עם החשבון המורשה שלכם. התוכן יופיע באתר בטעינה הבאה, ואפשר להמשיך
							לנהל אותו כאן.
						</Body>
					</View>
					<View style={{ gap: 7 }}>
						<Label>מעדכנים בלי להוריד הכול ידנית</Label>
						<Body>
							בקשו מהסוכן להשתמש בסקיל $davinci-update. הוא יעדכן את הסקילים והכלים
							מהאתר וישמור על הפרויקטים והעריכות המקומיות שלכם.
						</Body>
					</View>
					<Body style={{ fontSize: 11 }}>
						אין צורך בחשבון Git או במפתחות Cloudflare. נדרשים Python וחיבור אישי של
						הסוכן לאתר; שירותי AI וקריינות משתמשים בחשבון שלכם בנפרד.
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
