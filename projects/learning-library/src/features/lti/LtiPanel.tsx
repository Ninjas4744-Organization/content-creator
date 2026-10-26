import { View } from "react-native";
import type { AttemptState } from "./LtiClient";
import { Body, Button, ButtonText, Chip, ChipText, Heading, Row } from "../../ui/primitives";

export function LtiPanel({
	attempt,
	busy,
	error,
	onAnswer,
	onComplete,
}: {
	attempt: AttemptState;
	busy: boolean;
	error: string | null;
	onAnswer(question: string, option: number): void;
	onComplete(): void;
}) {
	const answered = attempt.questions.every((question) => question.id in attempt.answers);
	return (
		<View style={{ gap: 20, paddingVertical: 22 }}>
			<Heading $compact>השלמת השיעור</Heading>
			<Body accessibilityLiveRegion="polite">
				{attempt.kind === "deck"
					? `עברתם על ${Math.round(attempt.progress * 100)}% מהשקפים.`
					: `צפיתם ב־${Math.round(attempt.progress * 100)}% מהסרטון. להשלמה נדרשת צפייה ב־90% לפחות.`}
			</Body>
			{attempt.questions.length > 0 && <Body>ענו על כל השאלות ושלחו את התוצאה לקורס.</Body>}
			{attempt.questions.map((question) => (
				<View key={question.id} style={{ gap: 12 }}>
					<Body style={{ color: "#FAFCFF" }}>{question.question}</Body>
					<Row style={{ flexWrap: "wrap" }}>
						{question.options.map((option, index) => (
							<Chip
								key={index}
								$selected={attempt.answers[question.id] === index}
								disabled={busy || !!attempt.result}
								accessibilityRole="radio"
								accessibilityState={{
									checked: attempt.answers[question.id] === index,
									disabled: busy || !!attempt.result,
								}}
								onPress={() => onAnswer(question.id, index)}
							>
								<ChipText $selected={attempt.answers[question.id] === index}>
									{option}
								</ChipText>
							</Chip>
						))}
					</Row>
				</View>
			))}
			{attempt.result && (
				<Body accessibilityLiveRegion="polite">
					ציון: {Math.round(attempt.result.score * 100)}.{" "}
					{attempt.result.completion === "Yes"
						? "השיעור הושלם בהצלחה."
						: "השיעור הסתיים ללא ציון עובר."}{" "}
					{attempt.reported
						? "התוצאה דווחה לקורס. אפשר לחזור אליו."
						: "התוצאה נשמרה וממתינה לדיווח."}
				</Body>
			)}
			{!attempt.reporting && (
				<Body accessibilityRole="alert">
					הקורס אינו מאפשר דיווח על השיעור הזה. פנו למנהל הקורס.
				</Body>
			)}
			{error && <Body accessibilityRole="alert">{error}</Body>}
			{!attempt.reported && (
				<Button
					onPress={onComplete}
					disabled={busy || !attempt.reporting || !attempt.ready || !answered}
					accessibilityRole="button"
					accessibilityState={{
						disabled: busy || !attempt.reporting || !attempt.ready || !answered,
					}}
					style={{
						alignSelf: "flex-start",
						opacity:
							busy || !attempt.reporting || !attempt.ready || !answered ? 0.5 : 1,
					}}
				>
					<ButtonText>
						{busy
							? "שומרים…"
							: attempt.result
								? "ניסיון נוסף לדיווח"
								: "שליחת התוצאה לקורס"}
					</ButtonText>
				</Button>
			)}
		</View>
	);
}
