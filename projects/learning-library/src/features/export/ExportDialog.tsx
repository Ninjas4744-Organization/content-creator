import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTheme } from "styled-components/native";
import type { LearningItem, MediaKind } from "../../models/catalog";
import { Body, Button, ButtonText, Chip, ChipText, Label, Row } from "../../ui/primitives";
import { WebLink } from "../../ui/browserMedia";
import { Icon } from "../../ui/Icon";
import { ModalDialog } from "../../ui/ModalDialog";
import { ltiResourceUrl } from "./links";

export function ExportDialog({
	item,
	initialKind,
}: {
	item: LearningItem;
	initialKind: MediaKind;
}) {
	const theme = useTheme();
	const [open, setOpen] = useState(false);
	const [kind, setKind] = useState(initialKind);
	const [message, setMessage] = useState("");
	const link =
		typeof window === "undefined" ? "" : ltiResourceUrl(window.location.href, item.id, kind);
	const archive = item.scorm?.[kind];
	const card = {
		gap: 12,
		padding: 18,
		borderWidth: 1,
		borderColor: theme.border,
		borderRadius: 14,
		backgroundColor: theme.background,
	};
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(link);
			setMessage("הקישור הועתק. אפשר להדביק אותו בקורס.");
		} catch {
			setMessage("אפשר לסמן ולהעתיק את הקישור מהשדה.");
		}
	}
	function close() {
		setOpen(false);
		setMessage("");
	}
	return (
		<>
			<Button
				$secondary
				onPress={() => {
					setMessage("");
					setOpen(true);
				}}
				accessibilityRole="button"
				aria-haspopup="dialog"
				accessibilityState={{ expanded: open }}
			>
				<Icon name="export" size={17} />
				<ButtonText $secondary>ייצוא</ButtonText>
			</Button>
			<ModalDialog open={open} onClose={close} title="ייצוא ההדרכה" description={item.title}>
				<View style={{ padding: 20, gap: 16 }}>
					<View style={{ gap: 10 }}>
						<Label>מה מייצאים?</Label>
						<Row style={{ gap: 8 }}>
							{(
								[
									["deck", "מצגת", "slides"],
									["video", "סרטון", "play"],
								] as const
							)
								.filter(([value]) => item[value])
								.map(([value, label, icon]) => (
									<Chip
										key={value}
										$selected={kind === value}
										accessibilityRole="button"
										accessibilityState={{ selected: kind === value }}
										onPress={() => {
											setKind(value);
											setMessage("");
										}}
										style={{ flex: 1, alignItems: "center" }}
									>
										<Row style={{ gap: 9 }}>
											<Icon
												name={icon}
												size={17}
												color={kind === value ? theme.blue : theme.muted}
											/>
											<ChipText $selected={kind === value}>{label}</ChipText>
										</Row>
									</Chip>
								))}
						</Row>
					</View>
					<View style={card}>
						<Row style={{ justifyContent: "space-between" }}>
							<Label style={{ fontSize: 17 }}>חבילת SCORM</Label>
							<Icon name="export" size={21} color={theme.primary} />
						</Row>
						<Body style={{ fontSize: 13, lineHeight: 22 }}>
							קובץ ZIP להתקנה במערכת הלמידה, עם שאלון סיום ושמירת התקדמות.
						</Body>
						<Body style={{ fontSize: 12, lineHeight: 18, color: theme.blue }}>
							SCORM 1.2 · ציון מעבר 80
						</Body>
						{archive ? (
							<WebLink
								path={archive}
								primary
								download
								label={`הורדת SCORM — ${kind === "deck" ? "מצגת" : "סרטון"}`}
							>
								<Icon name="download" size={17} color={theme.primaryText} />
								הורדת ZIP
							</WebLink>
						) : (
							<Body>חבילת הייצוא לפורמט זה עדיין אינה זמינה.</Body>
						)}
					</View>
					<View style={card}>
						<Row style={{ justifyContent: "space-between" }}>
							<Label style={{ fontSize: 17 }}>קישור LTI</Label>
							<Icon name="external" size={20} color={theme.blue} />
						</Row>
						<Body style={{ fontSize: 13, lineHeight: 22 }}>
							הדרכה שמתעדכנת מהספרייה. נדרש חיבור LTI 1.3 במערכת הלמידה.
						</Body>
						<TextInput
							value={link}
							editable={false}
							selectTextOnFocus
							accessibilityLabel="קישור LTI לקורס"
							style={{
								fontFamily: theme.font,
								fontSize: 12,
								color: theme.muted,
								borderColor: theme.border,
								borderWidth: 1,
								borderRadius: 8,
								padding: 12,
								direction: "ltr",
								textAlign: "left",
							}}
						/>
						<Button $secondary onPress={copyLink} accessibilityRole="button">
							<Icon name="copy" size={17} />
							<ButtonText $secondary>העתקת קישור</ButtonText>
						</Button>
						<Body
							accessibilityLiveRegion="polite"
							style={{
								fontSize: 12,
								lineHeight: 18,
								minHeight: 18,
								color: theme.success,
							}}
						>
							{message}
						</Body>
					</View>
				</View>
			</ModalDialog>
		</>
	);
}
