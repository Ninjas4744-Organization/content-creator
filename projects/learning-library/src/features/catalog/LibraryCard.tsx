import { View } from "react-native";
import styled, { useTheme } from "styled-components/native";
import type { LearningItem, MediaKind } from "../../models/catalog";
import { Body, Button, ButtonText, Label, Row } from "../../ui/primitives";
import { Icon } from "../../ui/Icon";

const Card = styled.View`
	overflow: hidden;
	border-radius: 13px;
	border-width: 1px;
	border-color: ${({ theme }) => theme.border};
	background-color: ${({ theme }) => theme.surface};
	flex-grow: 1;
`;
const Poster = styled.Image`
	width: 100%;
	aspect-ratio: 1.77778;
	background-color: ${({ theme }) => theme.card};
`;
const Title = styled.Text`
	font-family: ${({ theme }) => theme.bold};
	font-size: 21px;
	line-height: 31px;
	text-align: right;
	color: ${({ theme }) => theme.text};
`;
const Tag = styled.Text`
	font-family: ${({ theme }) => theme.font};
	font-size: 12px;
	color: ${({ theme }) => theme.blue};
	text-align: right;
`;

export function durationLabel(seconds: number | null) {
	if (!seconds) return "";
	const rounded = Math.round(seconds);
	return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} דק׳`;
}

export function LibraryCard({
	item,
	onOpen,
}: {
	item: LearningItem;
	onOpen(id: string, kind: MediaKind): void;
}) {
	const theme = useTheme();
	return (
		<Card>
			<Poster
				source={{ uri: item.poster }}
				accessibilityLabel={`תצוגה מקדימה: ${item.title}`}
				resizeMode="cover"
			/>
			<View style={{ padding: 23, gap: 14, flex: 1 }}>
				<Row style={{ justifyContent: "space-between" }}>
					<Tag>{item.category}</Tag>
					{item.video && (
						<Row style={{ gap: 5 }}>
							<Icon name="clock" size={14} />
							<Tag>{durationLabel(item.duration)}</Tag>
						</Row>
					)}
				</Row>
				<Title accessibilityRole="header">{item.title}</Title>
				<Body style={{ fontSize: 14, lineHeight: 24, flex: 1 }}>{item.description}</Body>
				<Row style={{ gap: 16, flexWrap: "wrap", marginTop: 2 }}>
					{item.deck && (
						<Row style={{ gap: 6 }}>
							<Icon name="slides" size={15} />
							<Label style={{ fontSize: 12 }}>{item.slides} שקפים</Label>
						</Row>
					)}
					{item.video && (
						<Row style={{ gap: 6 }}>
							<Icon name="check" size={15} />
							<Label style={{ fontSize: 12 }}>{item.checkpoints} שאלות בדרך</Label>
						</Row>
					)}
				</Row>
				<Row style={{ marginTop: 8, gap: 8 }}>
					{item.video && (
						<Button
							style={{ flex: 1, paddingHorizontal: 10 }}
							accessibilityRole="button"
							accessibilityLabel={`צפייה בסרטון: ${item.title}`}
							onPress={() => onOpen(item.id, "video")}
						>
							<Icon name="play" size={16} color={theme.primaryText} />
							<ButtonText>לצפייה</ButtonText>
						</Button>
					)}
					{item.deck && (
						<Button
							$secondary
							style={{ flex: 1, paddingHorizontal: 10 }}
							accessibilityRole="button"
							accessibilityLabel={`פתיחת מצגת: ${item.title}`}
							onPress={() => onOpen(item.id, "deck")}
						>
							<Icon name="slides" size={16} />
							<ButtonText $secondary>למצגת</ButtonText>
						</Button>
					)}
				</Row>
			</View>
		</Card>
	);
}
