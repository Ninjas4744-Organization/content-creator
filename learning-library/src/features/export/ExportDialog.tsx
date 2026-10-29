import { useState } from "react";
import { View } from "react-native";
import { useTheme } from "styled-components/native";
import type { LearningItem, MediaKind } from "../../models/catalog";
import { Body, Button, ButtonText, Chip, ChipText, Label, Row } from "../../ui/primitives";
import { WebLink } from "../../ui/browserMedia";
import { Icon } from "../../ui/Icon";
import { ModalDialog } from "../../ui/ModalDialog";

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
	const archive = item.scorm?.[kind];
	const card = {
		gap: 12,
		padding: 18,
		borderWidth: 1,
		borderColor: theme.border,
		borderRadius: 14,
		backgroundColor: theme.background,
	};
	return (
		<>
			<Button
				$secondary
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				aria-haspopup="dialog"
				accessibilityState={{ expanded: open }}
			>
				<Icon name="export" size={17} />
				<ButtonText $secondary>ייצוא</ButtonText>
			</Button>
			<ModalDialog
				open={open}
				onClose={() => setOpen(false)}
				title="ייצוא ל־SCORM"
				description={item.title}
			>
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
										onPress={() => setKind(value)}
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
				</View>
			</ModalDialog>
		</>
	);
}
