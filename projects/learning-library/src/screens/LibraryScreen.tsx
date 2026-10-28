import { ActivityIndicator, Image, View, useWindowDimensions } from "react-native";
import { observer } from "mobx-react-lite";
import styled, { useTheme } from "styled-components/native";
import type { CatalogStore } from "../features/catalog/CatalogStore";
import { LibraryCard, durationLabel } from "../features/catalog/LibraryCard";
import { galleries } from "../features/catalog/galleries";
import type { LearningItem, MediaKind } from "../models/catalog";
import {
	Body,
	Button,
	ButtonText,
	Chip,
	ChipText,
	Container,
	Heading,
	Label,
	Page,
	Row,
} from "../ui/primitives";
import { Icon } from "../ui/Icon";
import { MediaFrame, WebLink } from "../ui/browserMedia";
import type { ReactNode } from "react";
import type { LearningProgress } from "../features/lti/LtiClient";
import { ExportDialog } from "../features/export/ExportDialog";

const Header = styled.View`
	border-bottom-width: 1px;
	border-bottom-color: ${({ theme }) => theme.border};
	padding-vertical: 22px;
`;
const Eyebrow = styled.Text`
	font-family: ${({ theme }) => theme.font};
	font-size: 12px;
	letter-spacing: 1px;
	color: ${({ theme }) => theme.primary};
	text-align: right;
`;
const HeroTitle = styled.Text<{ $compact: boolean }>`
	font-family: ${({ theme }) => theme.bold};
	font-size: ${({ $compact }) => ($compact ? 44 : 68)}px;
	line-height: ${({ $compact }) => ($compact ? 57 : 85)}px;
	color: ${({ theme }) => theme.text};
	text-align: right;
`;
const SearchBox = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 12px;
	border-radius: 9px;
	border-width: 1px;
	border-color: ${({ theme }) => theme.border};
	padding-horizontal: 16px;
	background-color: ${({ theme }) => theme.surface};
`;
const Search = styled.TextInput`
	font-family: ${({ theme }) => theme.font};
	font-size: 14px;
	color: ${({ theme }) => theme.text};
	text-align: right;
	height: 50px;
	flex: 1;
`;
const Rule = styled.View`
	height: 1px;
	background-color: ${({ theme }) => theme.border};
`;

interface Props {
	store: CatalogStore;
	selectedId?: string;
	selectedKind: MediaKind;
	onOpen(id: string, kind: MediaKind): void;
	onClose(): void;
	banner?: ReactNode;
	viewerFooter?: ReactNode;
	locked?: boolean;
	onProgress?(event: LearningProgress): void;
}

function Viewer({
	item,
	kind,
	onOpen,
	onClose,
	compact,
	locked,
	viewerFooter,
	onProgress,
}: { item: LearningItem; kind: MediaKind; compact: boolean } & Pick<
	Props,
	"onOpen" | "onClose" | "locked" | "viewerFooter" | "onProgress"
>) {
	const path = item[kind];
	return (
		<Container $compact={compact} style={{ paddingTop: 30, paddingBottom: 45, gap: 22 }}>
			{!locked && (
				<Button
					$secondary
					style={{ alignSelf: "flex-start" }}
					onPress={onClose}
					accessibilityRole="button"
				>
					<Icon name="back" size={17} />
					<ButtonText $secondary>בחזרה לספרייה</ButtonText>
				</Button>
			)}
			<View style={{ gap: 10 }}>
				<Eyebrow>{item.category}</Eyebrow>
				<Heading $compact={compact} accessibilityRole="header">
					{item.title}
				</Heading>
				<Body>{item.description}</Body>
			</View>
			{!locked && (
				<Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
					<Row>
						{item.video && (
							<Chip
								$selected={kind === "video"}
								accessibilityRole="button"
								accessibilityState={{ selected: kind === "video" }}
								onPress={() => onOpen(item.id, "video")}
							>
								<ChipText $selected={kind === "video"}>סרטון אינטראקטיבי</ChipText>
							</Chip>
						)}
						{item.deck && (
							<Chip
								$selected={kind === "deck"}
								accessibilityRole="button"
								accessibilityState={{ selected: kind === "deck" }}
								onPress={() => onOpen(item.id, "deck")}
							>
								<ChipText $selected={kind === "deck"}>מצגת</ChipText>
							</Chip>
						)}
					</Row>
					<Row style={{ flexWrap: "wrap", gap: 8 }}>
						{path && (
							<WebLink path={path} label="פתיחה בלשונית חדשה">
								<Icon name="external" size={16} />
								פתיחה בלשונית
							</WebLink>
						)}
						{item.powerpoint && (
							<WebLink path={item.powerpoint} download>
								<Icon name="download" size={16} />
								PowerPoint
							</WebLink>
						)}
						<ExportDialog key={`${item.id}:${kind}`} item={item} initialKind={kind} />
					</Row>
				</Row>
			)}
			{path ? (
				<MediaFrame
					path={path}
					title={`${kind === "video" ? "סרטון" : "מצגת"}: ${item.title}`}
					kind={kind}
					onProgress={onProgress}
				/>
			) : (
				<Body>הפורמט הזה עדיין לא זמין. אפשר לבחור בפורמט אחר למעלה.</Body>
			)}
			{viewerFooter}
			<Body>
				{kind === "deck"
					? "אפשר לעבור בין השקפים באמצעות החצים ולפתוח את הערות המנחה מתוך המצגת."
					: "בחרו פרק בנגן, הפעילו כתוביות או ענו על השאלות לאורך הסרטון. ההתקדמות נשמרת בדפדפן שלכם."}
			</Body>
		</Container>
	);
}

export const LibraryScreen = observer(function LibraryScreen({
	store,
	selectedId,
	selectedKind,
	onOpen,
	onClose,
	banner,
	viewerFooter,
	locked,
	onProgress,
}: Props) {
	const { width } = useWindowDimensions();
	const theme = useTheme();
	const compact = width < 720;
	const columns = width < 720 ? 1 : width < 1100 ? 2 : 3;
	const study = store.gallery === "study";
	const details = galleries[store.gallery];
	const item = store.viewableItems.find((entry) => entry.id === selectedId);
	const featured = store.featured;
	return (
		<Page>
			<Header>
				<Container $compact={compact}>
					<Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
						<Row style={{ gap: 13 }}>
							<Image
								source={{ uri: "library/brand/logo.png" }}
								accessibilityLabel="סמל דה וינצ׳י"
								style={{ width: 41, height: 47 }}
								resizeMode="contain"
							/>
							<View style={{ gap: 2 }}>
								<Label style={{ fontSize: 17 }}>
									דה וינצ׳י{" "}
									<Label style={{ color: theme.primary, fontSize: 17 }}>
										4744
									</Label>
								</Label>
								<Body style={{ fontSize: 11, lineHeight: 16 }}>
									לומדים. בונים. משתפים.
								</Body>
							</View>
						</Row>
						<Row style={{ gap: 9 }}>
							<Icon name="library" size={18} />
							<Label style={{ fontSize: 12 }}>{details.title}</Label>
						</Row>
					</Row>
				</Container>
			</Header>
			{banner && (
				<Container $compact={compact} style={{ paddingTop: 22, gap: 12 }}>
					{banner}
				</Container>
			)}
			{store.loading ? (
				<Container $compact={compact} style={{ paddingVertical: 90, gap: 18 }}>
					<ActivityIndicator color={theme.primary} accessibilityLabel="טוען את הספרייה" />
					<Body style={{ textAlign: "center" }}>טוענים את הספרייה…</Body>
				</Container>
			) : store.error ? (
				<Container $compact={compact} style={{ paddingVertical: 90, gap: 20 }}>
					<Body accessibilityRole="alert">{store.error}</Body>
					<Button
						onPress={store.load}
						accessibilityRole="button"
						style={{ alignSelf: "flex-start" }}
					>
						<ButtonText>ניסיון נוסף</ButtonText>
					</Button>
				</Container>
			) : selectedId ? (
				item ? (
					<Viewer
						item={item}
						kind={selectedKind}
						compact={compact}
						onOpen={onOpen}
						onClose={onClose}
						locked={locked}
						viewerFooter={viewerFooter}
						onProgress={onProgress}
					/>
				) : (
					<Container $compact={compact} style={{ paddingVertical: 70, gap: 20 }}>
						<Heading>התוכן הזה לא נמצא</Heading>
						<Button onPress={onClose} accessibilityRole="button">
							<ButtonText>בחזרה לספרייה</ButtonText>
						</Button>
					</Container>
				)
			) : (
				<>
					<Container $compact={compact}>
						<View
							style={{
								paddingTop: compact ? 46 : 64,
								paddingBottom: compact ? 36 : 50,
								gap: 23,
							}}
						>
							<Eyebrow>{details.eyebrow}</Eyebrow>
							<HeroTitle $compact={compact} accessibilityRole="header">
								{details.hero}
							</HeroTitle>
							<Body
								style={{
									maxWidth: 550,
									fontSize: compact ? 16 : 18,
									lineHeight: 30,
								}}
							>
								{details.description}
							</Body>
							<Row style={{ gap: 24, paddingTop: 6, flexWrap: "wrap" }}>
								<Row style={{ gap: 8 }}>
									<Icon name="slides" size={17} color={theme.blue} />
									<Body style={{ fontSize: 13 }}>{store.deckCount} מצגות</Body>
								</Row>
								<Row style={{ gap: 8 }}>
									<Icon name="play" size={17} color={theme.blue} />
									<Body style={{ fontSize: 13 }}>
										{store.videoCount} סרטונים אינטראקטיביים
									</Body>
								</Row>
								<Body style={{ fontSize: 13, color: theme.success }}>
									בעברית, מההתחלה ועד הסוף
								</Body>
							</Row>
						</View>
						{featured && (
							<View
								style={{
									borderRadius: 14,
									overflow: "hidden",
									borderWidth: 1,
									borderColor: theme.featuredBorder,
									flexDirection: compact ? "column" : "row",
									backgroundColor: theme.featured,
								}}
							>
								<View
									style={{
										flex: 1,
										padding: compact ? 25 : 34,
										gap: 14,
										justifyContent: "center",
									}}
								>
									<Eyebrow>זרקור על הלמידה</Eyebrow>
									<Heading $compact accessibilityRole="header">
										{featured.title}
									</Heading>
									<Body style={{ fontSize: 14 }}>{featured.description}</Body>
									<Row style={{ flexWrap: "wrap", gap: 8, paddingTop: 8 }}>
										<Button
											accessibilityRole="button"
											onPress={() =>
												onOpen(
													featured.id,
													featured.video ? "video" : "deck",
												)
											}
										>
											<ButtonText>מתחילים כאן</ButtonText>
											<Icon
												name="arrow"
												color={theme.primaryText}
												size={18}
											/>
										</Button>
										<Body style={{ fontSize: 12 }}>
											{featured.video
												? durationLabel(featured.duration)
												: `${featured.slides} שקפים`}{" "}
											· {featured.category}
										</Body>
									</Row>
								</View>
								<Image
									source={{ uri: featured.poster }}
									accessibilityLabel={`מתוך ${featured.title}`}
									resizeMode="cover"
									style={
										compact
											? { width: "100%", aspectRatio: 16 / 9 }
											: { width: "46%", minHeight: 285 }
									}
								/>
							</View>
						)}
						<View style={{ paddingTop: 55, paddingBottom: 25, gap: 22 }}>
							<Row
								style={{
									justifyContent: "space-between",
									alignItems: "flex-end",
									flexWrap: "wrap",
									gap: 20,
								}}
							>
								<View style={{ gap: 7 }}>
									<Heading $compact accessibilityRole="header">
										מה לומדים היום?
									</Heading>
									<Body style={{ fontSize: 14 }}>בוחרים נושא, ויוצאים לדרך.</Body>
								</View>
								<SearchBox style={{ width: compact ? "100%" : 330 }}>
									<Icon name="search" size={19} color={theme.muted} />
									<Search
										accessibilityLabel="חיפוש בספרייה"
										placeholder={details.searchPlaceholder}
										placeholderTextColor={theme.muted}
										value={store.query}
										onChangeText={store.setQuery}
									/>
								</SearchBox>
							</Row>
							<Row
								style={{
									justifyContent: "space-between",
									flexWrap: "wrap",
									gap: 20,
								}}
							>
								<Row
									style={{
										flexWrap: "wrap",
										gap: 8,
										width: compact ? "100%" : undefined,
									}}
								>
									{store.categories.map((category) => (
										<Chip
											key={category}
											$selected={store.category === category}
											accessibilityRole="button"
											accessibilityState={{
												selected: store.category === category,
											}}
											onPress={() => store.setCategory(category)}
										>
											<ChipText $selected={store.category === category}>
												{category}
											</ChipText>
										</Chip>
									))}
								</Row>
								<Row style={{ gap: 6 }}>
									{(
										[
											["all", "כל הפורמטים"],
											["video", "סרטונים"],
											["deck", "מצגות"],
										] as const
									).map(([value, label]) => (
										<Chip
											key={value}
											$selected={store.filter === value}
											accessibilityRole="button"
											accessibilityState={{
												selected: store.filter === value,
											}}
											onPress={() => store.setFilter(value)}
										>
											<ChipText $selected={store.filter === value}>
												{label}
											</ChipText>
										</Chip>
									))}
								</Row>
							</Row>
						</View>
						<Rule />
						<Body
							accessibilityLiveRegion="polite"
							style={{ paddingVertical: 19, fontSize: 12 }}
						>
							{store.visibleItems.length} נושאים בספרייה
						</Body>
						<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 22 }}>
							{store.visibleItems.map((entry) => (
								<View
									key={entry.id}
									style={{
										width:
											columns === 1
												? "100%"
												: `${(100 - (columns - 1) * ((22 / (Math.min(width, 1240) - (compact ? 44 : 96))) * 100)) / columns}%`,
									}}
								>
									<LibraryCard item={entry} onOpen={onOpen} />
								</View>
							))}
						</View>
						{study && store.listedItems.length === 0 ? (
							<View
								style={{
									paddingVertical: 46,
									paddingHorizontal: compact ? 22 : 40,
									gap: 14,
									alignItems: "center",
									backgroundColor: theme.surface,
									borderWidth: 1,
									borderColor: theme.border,
									borderRadius: 14,
								}}
							>
								<Icon name="book" size={38} color={theme.primary} />
								<Heading $compact style={{ textAlign: "center" }}>
									התוכן הראשון בדרך
								</Heading>
								<Body style={{ textAlign: "center", maxWidth: 510 }}>
									כאן יופיעו חומרי לימוד ותרגול למקצועות בית הספר.
									{"\n"}כשהתוכן הראשון יעלה, תוכלו לבחור נושא ולהתחיל ללמוד.
								</Body>
							</View>
						) : store.visibleItems.length === 0 ? (
							<View style={{ paddingVertical: 55, gap: 16, alignItems: "center" }}>
								<Icon name="search" size={32} />
								<Heading $compact>לא נמצאו נושאים מתאימים</Heading>
								<Body style={{ textAlign: "center" }}>
									נסו מילים אחרות או בחרו קטגוריה נוספת.
								</Body>
								<Button $secondary onPress={store.reset} accessibilityRole="button">
									<ButtonText $secondary>ניקוי החיפוש והסינון</ButtonText>
								</Button>
							</View>
						) : null}
						<View style={{ paddingTop: 50, paddingBottom: 42, gap: 12 }}>
							<Rule />
							<Row style={{ paddingTop: 20, gap: 14 }}>
								<Icon name="check" size={20} color={theme.success} />
								<Body style={{ fontSize: 13 }}>
									{study
										? "לומדים בקצב שלכם: חוזרים להסבר, מתרגלים ומגיעים מוכנים למבחן."
										: "לא רק צופים — משתתפים. בסרטונים תמצאו פרקים, כתוביות ושאלות למחשבה."}
								</Body>
							</Row>
						</View>
					</Container>
				</>
			)}
			<Container $compact={compact} style={{ marginTop: "auto", paddingBottom: 26 }}>
				<Rule />
				<Row
					style={{
						justifyContent: "space-between",
						paddingTop: 24,
						flexWrap: "wrap",
						gap: 12,
					}}
				>
					<Image
						source={{ uri: "library/brand/wordmark.png" }}
						style={{ width: 115, height: 30 }}
						resizeMode="contain"
						accessibilityLabel="Da Vinci 4744"
					/>
					<Body style={{ fontSize: 12 }}>בונים רובוטים. מצמיחים אנשים.</Body>
				</Row>
			</Container>
		</Page>
	);
});
