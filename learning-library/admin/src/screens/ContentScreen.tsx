import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { View, type TextInput } from "react-native";
import { useRouter } from "expo-router";
import { observer } from "mobx-react-lite";
import styled, { useTheme } from "styled-components/native";
import type { CatalogSort, Gallery, LearningItem, MediaFilter } from "../models/catalog";
import type { CatalogStore } from "../features/catalog/CatalogStore";
import { CatalogItems } from "../features/catalog/CatalogItems";
import { GalleryTabs } from "../features/catalog/GalleryTabs";
import {
	CatalogLoading,
	CatalogPanel,
	CatalogPanelHeader,
	CatalogStorageNote,
} from "../features/catalog/CatalogPanel";
import { Body, Label, Heading, Button, ButtonText, Row } from "../ui/primitives";
import { Icon } from "../ui/Icon";
import { Select, IconButton } from "../ui/browserControls";

const Search = styled.TextInput`
	font-family: ${({ theme }) => theme.font};
	font-size: 12px;
	color: ${({ theme }) => theme.text};
	text-align: right;
	flex: 1;
	min-width: 80px;
	height: 38px;
`;

export const ContentScreen = observer(function ContentScreen({
	store,
	width,
	tab,
	children,
	onEdit,
	onImport,
	onCreatorTools,
}: PropsWithChildren<{
	store: CatalogStore;
	width: number;
	tab: "all" | "library" | "new";
	onEdit(item: LearningItem): void;
	onImport(): void;
	onCreatorTools(): void;
}>) {
	const router = useRouter();
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

	const show = (filter: MediaFilter, featured = false) => {
		store.setQuery("");
		store.setCategory("הכול");
		store.setFilter(filter);
		store.clearSelection();
		if ((store.view === "featured") !== featured) router.push(featured ? "/?featured=1" : "/");
	};

	return (
		<>
			<Row style={{ justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
				<View style={{ gap: 5 }}>
					<Heading $compact={compact} accessibilityRole="header">
						ניהול תכנים
					</Heading>
					<Body>נהלו מצגות, סרטונים וחומרי למידה לפי ספרייה.</Body>
				</View>
				<Button accessibilityRole="button" aria-haspopup="dialog" onPress={onCreatorTools}>
					<Icon name="plus" color="white" size={17} />
					<ButtonText>הוספת תוכן</ButtonText>
				</Button>
			</Row>
			<GalleryTabs store={store} tab={tab} />
			{children}
			{tab === "all" && (
				<Row style={{ flexWrap: "wrap", gap: 8 }}>
					<Button $secondary accessibilityRole="button" onPress={() => show("all")}>
						<ButtonText $secondary>כל התכנים · {store.items.length}</ButtonText>
					</Button>
					<Button $secondary accessibilityRole="button" onPress={() => show("deck")}>
						<ButtonText $secondary>מצגות · {store.deckCount}</ButtonText>
					</Button>
					<Button $secondary accessibilityRole="button" onPress={() => show("video")}>
						<ButtonText $secondary>
							סרטונים אינטראקטיביים · {store.videoCount}
						</ButtonText>
					</Button>
					<Button $secondary accessibilityRole="button" onPress={() => show("all", true)}>
						<ButtonText $secondary>מומלצים · {store.featuredCount}</ButtonText>
					</Button>
				</Row>
			)}
			<CatalogPanel>
				<CatalogPanelHeader
					store={store}
					compact={compact}
					title={store.viewName}
					count={store.visibleItems.length}
					onImport={onImport}
				/>
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
						aria-label="תחום"
						value={store.category}
						onChange={(event) => store.setCategory(event.target.value)}
					>
						{store.categories.map((category) => (
							<option key={category} value={category}>
								{category === "הכול" ? "כל התחומים" : category}
							</option>
						))}
					</Select>
					<Select
						aria-label="פורמט"
						value={store.filter}
						onChange={(event) => store.setFilter(event.target.value as MediaFilter)}
					>
						<option value="all">כל הפורמטים</option>
						<option value="deck">מצגות</option>
						<option value="video">סרטונים</option>
					</Select>
					<Select
						aria-label="מיון"
						value={store.sort}
						onChange={(event) => store.setSort(event.target.value as CatalogSort)}
					>
						<option value="original">סדר הקטלוג</option>
						<option value="title">שם התוכן</option>
						<option value="featured">מומלצים תחילה</option>
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
				{!!store.selected.length && (
					<Row
						style={{
							gap: 10,
							flexWrap: "wrap",
							padding: 14,
							backgroundColor: theme.card,
						}}
					>
						<Label style={{ fontSize: 11 }}>{store.selected.length} תכנים נבחרו</Label>
						<Select
							aria-label="העברת התכנים שנבחרו"
							value={bulkGallery}
							onChange={(event) => setBulkGallery(event.target.value as Gallery | "")}
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
								!store.galleries.some((entry) => entry.id === bulkGallery) ||
								store.saving
							}
							accessibilityRole="button"
							onPress={async () => {
								if (bulkGallery && (await store.moveSelected(bulkGallery)))
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
				{store.loading ? (
					<CatalogLoading />
				) : (
					<CatalogItems
						store={store}
						onEdit={onEdit}
						columns={width < 850 ? 1 : width < 1200 ? 2 : 3}
					/>
				)}
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
						מציגים {store.visibleItems.length} מתוך {store.items.length} תכנים
					</Body>
					<Body style={{ fontSize: 10 }}>
						• {store.production ? "הקטלוג מחובר לאתר הספרייה" : "הקטלוג נשמר במחשב הזה"}
					</Body>
				</Row>
			</CatalogPanel>
			<CatalogStorageNote store={store} />
		</>
	);
});
