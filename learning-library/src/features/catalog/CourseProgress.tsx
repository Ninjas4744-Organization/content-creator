import { View } from "react-native";
import { useTheme } from "styled-components/native";
import { Body, Chip, ChipText, Label, Row } from "../../ui/primitives";
import { Icon } from "../../ui/Icon";

export interface LessonCompletion {
	completed: boolean;
	onToggle(): void;
}

export function CompletionToggle({
	completed,
	onToggle,
	title,
}: LessonCompletion & { title: string }) {
	return (
		<Chip
			$selected={completed}
			accessibilityRole="button"
			aria-pressed={completed}
			accessibilityLabel={`השלמת שיעור: ${title}`}
			onPress={onToggle}
			style={{ alignSelf: "flex-start" }}
		>
			<Row style={{ gap: 7 }}>
				{completed && <Icon name="check" size={15} />}
				<ChipText $selected={completed}>{completed ? "הושלם" : "סימון כהושלם"}</ChipText>
			</Row>
		</Chip>
	);
}

export function CourseProgress({
	completed,
	total,
	saved,
}: {
	completed: number;
	total: number;
	saved: boolean;
}) {
	const theme = useTheme();
	return (
		<View style={{ padding: 16, gap: 6, borderRadius: 9, backgroundColor: theme.surface }}>
			<Label accessibilityLiveRegion="polite">
				שיעורים שהושלמו · {completed} מתוך {total}
			</Label>
			<progress
				aria-label="התקדמות בקורס"
				max={total}
				value={completed}
				style={{ width: "100%", height: 12, accentColor: theme.success }}
			/>
			<Body style={{ fontSize: 12 }}>
				{saved ? "ההתקדמות נשמרת בדפדפן הזה." : "ההתקדמות זמינה בחלון הזה בלבד."}
			</Body>
		</View>
	);
}
