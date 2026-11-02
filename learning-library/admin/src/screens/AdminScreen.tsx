import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View, useWindowDimensions } from "react-native";
import type { TextInput } from "react-native";
import { observer } from "mobx-react-lite";
import styled, { useTheme } from "styled-components/native";
import webStyled from "styled-components";
import type { AdminView, CatalogSort, Gallery, LearningItem, MediaFilter } from "../models/catalog";
import type { CatalogStore } from "../features/catalog/CatalogStore";
import { CatalogItems } from "../features/catalog/CatalogItems";
import { HistoryPanel } from "../features/history/HistoryPanel";
import { Sidebar } from "../ui/Sidebar";
import {
	Body,
	Label,
	Heading,
	Button,
	ButtonText,
	Chip,
	ChipText,
	Page,
	Row,
} from "../ui/primitives";
import { Icon, type IconName } from "../ui/Icon";
import { Select, IconButton, WebLink } from "../ui/browserControls";
import { apiUrl } from "../core/browserRepository";

const Panel = styled.View`
	border-radius: 10px;
	border-width: 1px;
	border-color: ${({ theme }) => theme.border};
	background-color: ${({ theme }) => theme.surface};
	overflow: hidden;
`;
const Search = styled.TextInput`
	font-family: ${({ theme }) => theme.font};
	font-size: 12px;
	color: ${({ theme }) => theme.text};
	text-align: right;
	flex: 1;
	min-width: 80px;
	height: 38px;
`;
const StatCard = styled.Pressable`
	border-width: 1px;
	border-color: ${({ theme }) => theme.border};
	border-radius: 9px;
	background-color: ${({ theme }) => theme.surface};
	padding: 20px;
	gap: 12px;
`;
const ErrorBox = webStyled.div`
	padding: 14px 18px; margin-bottom: 20px; border: 1px solid #e5cbc5; border-radius: 7px;
	background: #fff7f4; color: ${({ theme }) => theme.danger}; font: 12px/1.9 ${({ theme }) => theme.font};
	display: flex; align-items: center; justify-content: space-between; gap: 15px; flex-wrap: wrap;
`;
interface Props {
	store: CatalogStore;
	onEdit(item?: LearningItem): void;
	onImport(): void;
	onManageGalleries(): void;
	onCreatorTools(): void;
	onNavigate(view: AdminView): void;
}
export const AdminScreen = observer(function AdminScreen({
	store,
	onEdit,
	onImport,
	onManageGalleries,
	onCreatorTools,
	onNavigate,
}: Props) {
	const { width } = useWindowDimensions();
	const theme = useTheme();
	const compact = width < 760;
	const [bulkGallery, setBulkGallery] = useState<Gallery | "">("");
	const searchRef = useRef<TextInput>(null);
	useEffect(() => {
		const focusSearch = (event: KeyboardEvent) => {
			const target = document.activeElement;
			if (
				event.key !== "/" ||
				document.querySelector("dialog[open]") ||
				(target instanceof HTMLElement &&
					(target.isContentEditable ||
						["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
			)
				return;
			event.preventDefault();
			searchRef.current?.focus();
		};
		document.addEventListener("keydown", focusSearch);
		return () => document.removeEventListener("keydown", focusSearch);
	}, []);
	const stats: {
		label: string;
		count: number;
		note: string;
		icon: IconName;
		color: string;
		action(): void;
	}[] = [
		{
			label: "תכנים בספרייה",
			count: store.items.length,
			note: "כל הידע, במקום אחד",
			icon: "library",
			color: "#7b969b",
			action: store.reset,
		},
		{
			label: "מצגות",
			count: store.deckCount,
			note: "רעיונות שהופכים לשקפים",
			icon: "slides",
			color: "#809bb3",
			action: () => {
				store.reset();
				store.setFilter("deck");
			},
		},
		{
			label: "סרטונים אינטראקטיביים",
			count: store.videoCount,
			note: "לומדים בקצב שלכם",
			icon: "play",
			color: "#c5a064",
			action: () => {
				store.reset();
				store.setFilter("video");
			},
		},
		{
			label: "תכנים מומלצים",
			count: store.featuredCount,
			note: "שווה להתחיל איתם",
			icon: "star",
			color: "#a296b6",
			action: () => {
				store.reset();
				onNavigate("featured");
			},
		},
	];
	return (
		<Page style={{ flexDirection: compact ? "column" : "row" }}>
			<Sidebar
				compact={compact}
				view={store.view}
				count={store.items.length}
				galleries={store.galleries}
				busy={store.loading || store.saving}
				onManage={onManageGalleries}
				onCreatorTools={onCreatorTools}
				onNavigate={onNavigate}
			/>
			<View style={{ flex: 1, minWidth: 0 }}>
				<Row
					style={{
						backgroundColor: theme.surface,
						borderBottomWidth: 1,
						borderBottomColor: theme.border,
						paddingHorizontal: compact ? 20 : 38,
						minHeight: compact ? 55 : 76,
						justifyContent: "space-between",
						flexWrap: "wrap",
					}}
				>
					<Row style={{ gap: 13 }}>
						<Body style={{ fontSize: 11 }}>מרחב העבודה</Body>
						<Body>/</Body>
						<Label style={{ fontSize: 11 }}>{store.viewName}</Label>
					</Row>
					<Row style={{ gap: 16 }}>
						<Body style={{ fontSize: 10, color: theme.success }}>
							• {store.workspaceLabel}
						</Body>
						{store.production && (
							<WebLink
								href={apiUrl("/auth/account")}
								target="_blank"
								rel="noreferrer"
								style={{ fontSize: 11 }}
							>
								החשבון שלי
							</WebLink>
						)}
					</Row>
				</Row>
				<View
					role="main"
					style={{
						padding: compact ? 19 : 38,
						paddingTop: compact ? 28 : 43,
						width: "100%",
						maxWidth: 1450,
						alignSelf: "center",
						gap: 28,
					}}
				>
					<Row
						style={{
							justifyContent: "space-between",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 17,
						}}
					>
						<View style={{ gap: 8, flexShrink: 1 }}>
							<Body style={{ color: theme.primary, fontSize: 10 }}>
								• מנהלים ידע. יוצרים השפעה.
							</Body>
							<Heading $compact={compact} accessibilityRole="header">
								{store.view === "history"
									? "כל שינוי, חלק מהסיפור."
									: "הספרייה שלכם, במבט אחד."}
							</Heading>
							<Body style={{ fontSize: 12 }}>
								כל המצגות, הסרטונים וחומרי הלמידה. מסודרים, מעודכנים ומוכנים לשיתוף.
							</Body>
						</View>
						<Row style={{ gap: 10, flexWrap: "wrap" }}>
							<Button $secondary accessibilityRole="button" onPress={onCreatorTools}>
								<Icon name="download" size={17} />
								<ButtonText $secondary>כלים ליוצרי תוכן</ButtonText>
							</Button>
							<Button
								disabled={store.loading}
								accessibilityRole="button"
								onPress={() => onEdit()}
							>
								<Icon name="plus" color="white" size={17} />
								<ButtonText>הוספת תוכן</ButtonText>
							</Button>
						</Row>
					</Row>
					<Row style={{ flexWrap: "wrap", gap: compact ? 12 : 17 }}>
						{stats.map((stat) => (
							<StatCard
								key={stat.label}
								accessibilityRole="button"
								onPress={stat.action}
								style={{
									width: width < 1120 ? "47%" : "23%",
									flexGrow: 1,
									minHeight: 145,
								}}
							>
								<Row style={{ justifyContent: "space-between", gap: 7 }}>
									<Body style={{ fontSize: compact ? 10 : 11, flexShrink: 1 }}>
										{stat.label}
									</Body>
									<Icon name={stat.icon} size={19} color={stat.color} />
								</Row>
								<Label
									style={{ fontSize: 32, lineHeight: 38, fontFamily: theme.font }}
								>
									{stat.count}
								</Label>
								<Body style={{ fontSize: 9, lineHeight: 14 }}>{stat.note}</Body>
							</StatCard>
						))}
					</Row>
					{store.error && (
						<ErrorBox role="alert">
							<span>{store.error}</span>
							<WebLink as="button" type="button" onClick={() => void store.load()}>
								טעינה מחדש
							</WebLink>
							<IconButton
								aria-label="סגירת הודעת שגיאה"
								onClick={() => store.setError(null)}
							>
								<Icon name="close" size={15} />
							</IconButton>
						</ErrorBox>
					)}
					<Panel>
						<Row
							style={{
								justifyContent: "space-between",
								padding: compact ? 18 : 24,
								flexWrap: "wrap",
							}}
						>
							<View style={{ gap: 5 }}>
								<Label style={{ fontSize: 16 }}>
									{store.viewName}{" "}
									<Label style={{ fontSize: 12, color: theme.muted }}>
										{store.view === "history"
											? store.history.length
											: store.visibleItems.length}
									</Label>
								</Label>
								<Body style={{ fontSize: 10 }}>
									{store.updatedAt
										? `${store.production ? "נשמר באתר" : "נשמר מקומית"} · ${new Date(store.updatedAt).toLocaleString("he-IL")}`
										: "עותק של הספרייה · מוכן לעריכה מקומית"}
								</Body>
							</View>
							<Row style={{ gap: 6 }}>
								<Button
									$secondary
									disabled={store.loading}
									accessibilityRole="button"
									onPress={onImport}
									style={{ paddingHorizontal: 9, borderWidth: 0 }}
								>
									<Icon name="upload" size={15} />
									<ButtonText $secondary>ייבוא קטלוג</ButtonText>
								</Button>
								<WebLink href={apiUrl("/api/export")} download="catalog.json">
									<Icon name="download" size={15} />
									ייצוא
								</WebLink>
							</Row>
						</Row>
						{store.view !== "history" && (
							<>
								<Row
									style={{
										gap: 10,
										flexWrap: "wrap",
										paddingHorizontal: compact ? 18 : 24,
										paddingBottom: 18,
									}}
								>
									<Row
										style={{
											flex: 1,
											minWidth: compact ? 200 : 160,
											backgroundColor: "#fbfcfb",
											borderWidth: 1,
											borderColor: theme.border,
											paddingHorizontal: 10,
											borderRadius: 6,
										}}
									>
										<Icon name="search" size={16} />
										<Search
											ref={searchRef}
											accessibilityLabel="חיפוש תכנים"
											placeholder="חיפוש לפי שם, נושא או פרק…"
											placeholderTextColor={theme.muted}
											value={store.query}
											onChangeText={store.setQuery}
										/>
									</Row>
									<Select
										aria-label="קטגוריה"
										value={store.category}
										onChange={(event) => store.setCategory(event.target.value)}
									>
										{store.categories.map((category) => (
											<option key={category} value={category}>
												{category === "הכול" ? "כל הקטגוריות" : category}
											</option>
										))}
									</Select>
									<Select
										aria-label="פורמט"
										value={store.filter}
										onChange={(event) =>
											store.setFilter(event.target.value as MediaFilter)
										}
									>
										<option value="all">כל הפורמטים</option>
										<option value="deck">מצגות</option>
										<option value="video">סרטונים</option>
									</Select>
									<Row style={{ gap: 0, marginStart: "auto" }}>
										<IconButton
											aria-label="תצוגת רשימה"
											aria-pressed={store.layout === "table"}
											$selected={store.layout === "table"}
											onClick={() => store.setLayout("table")}
										>
											<Icon name="list" size={16} />
										</IconButton>
										<IconButton
											aria-label="תצוגת כרטיסים"
											aria-pressed={store.layout === "grid"}
											$selected={store.layout === "grid"}
											onClick={() => store.setLayout("grid")}
										>
											<Icon name="grid" size={16} />
										</IconButton>
									</Row>
								</Row>
								<Row
									style={{
										paddingHorizontal: compact ? 12 : 24,
										justifyContent: "space-between",
										flexWrap: "wrap",
										borderBottomWidth: 1,
										borderBottomColor: theme.border,
										gap: 5,
									}}
								>
									<Row style={{ gap: compact ? 2 : 9, flexWrap: "wrap" }}>
										{[{ id: "all", name: "הכול" }, ...store.galleries].map(
											({ id: value, name }) => (
												<Chip
													key={value}
													$selected={store.gallery === value}
													accessibilityRole="button"
													accessibilityState={{
														selected: store.gallery === value,
													}}
													onPress={() => store.setGallery(value)}
												>
													<ChipText $selected={store.gallery === value}>
														{name}
													</ChipText>
												</Chip>
											),
										)}
									</Row>
									<Select
										aria-label="מיון"
										value={store.sort}
										onChange={(event) =>
											store.setSort(event.target.value as CatalogSort)
										}
										style={{ border: 0, fontSize: 10 }}
									>
										<option value="original">סדר הקטלוג</option>
										<option value="title">שם התוכן</option>
										<option value="featured">מומלצים תחילה</option>
									</Select>
								</Row>
								{!!store.selected.length && (
									<Row
										style={{
											gap: 10,
											flexWrap: "wrap",
											padding: 14,
											backgroundColor: theme.card,
										}}
									>
										<Label style={{ fontSize: 11 }}>
											{store.selected.length} תכנים נבחרו
										</Label>
										<Select
											aria-label="העברת התכנים שנבחרו"
											value={bulkGallery}
											onChange={(event) =>
												setBulkGallery(event.target.value as Gallery | "")
											}
										>
											<option value="">העברה לספרייה…</option>
											{store.galleries.map(({ id, name }) => (
												<option key={id} value={id}>
													{name}
												</option>
											))}
										</Select>
										<Button
											disabled={
												!store.galleries.some(
													(entry) => entry.id === bulkGallery,
												) || store.saving
											}
											accessibilityRole="button"
											onPress={async () => {
												if (
													bulkGallery &&
													(await store.moveSelected(bulkGallery))
												)
													setBulkGallery("");
											}}
										>
											<ButtonText>החלה</ButtonText>
										</Button>
										<Button
											$secondary
											accessibilityRole="button"
											onPress={store.clearSelection}
										>
											<ButtonText $secondary>ביטול בחירה</ButtonText>
										</Button>
									</Row>
								)}
							</>
						)}
						{store.loading ? (
							<View style={{ padding: 70, gap: 15 }}>
								<ActivityIndicator
									color={theme.primary}
									accessibilityLabel="טוען את הקטלוג"
								/>
								<Body style={{ textAlign: "center" }}>טוענים את התכנים שלכם…</Body>
							</View>
						) : store.view === "history" ? (
							<HistoryPanel store={store} />
						) : (
							<CatalogItems
								store={store}
								onEdit={onEdit}
								columns={width < 850 ? 1 : width < 1200 ? 2 : 3}
							/>
						)}
						{store.view !== "history" && (
							<Row
								style={{
									borderTopWidth: 1,
									borderTopColor: theme.border,
									padding: 17,
									justifyContent: "space-between",
									flexWrap: "wrap",
								}}
							>
								<Body style={{ fontSize: 10 }}>
									מציגים {store.visibleItems.length} מתוך {store.items.length}{" "}
									תכנים
								</Body>
								<Body style={{ fontSize: 10 }}>
									•{" "}
									{store.production
										? "הקטלוג מחובר לאתר הספרייה"
										: "הקטלוג נשמר במחשב הזה"}
								</Body>
							</Row>
						)}
					</Panel>
					<Row style={{ gap: 9, alignItems: "flex-start" }}>
						<Icon name="info" size={16} />
						<Body style={{ flex: 1, fontSize: 11 }}>
							{store.production
								? "שינויים נשמרים ישירות באתר הספרייה. גרסאות קודמות זמינות בהיסטוריית השינויים."
								: "מרחב לעריכה מקומית. שינויים נשמרים כאן ואפשר לייצא אותם כקטלוג."}
						</Body>
					</Row>
					<Row
						style={{
							borderTopWidth: 1,
							borderTopColor: theme.border,
							paddingTop: 18,
							justifyContent: "space-between",
							flexWrap: "wrap",
						}}
					>
						<Body style={{ fontSize: 10 }}>נוצר בשביל מי שיוצרים ידע.</Body>
						<Body style={{ fontSize: 9 }}>DA VINCI 4744 · CONTENT ADMIN</Body>
					</Row>
				</View>
			</View>
		</Page>
	);
});
