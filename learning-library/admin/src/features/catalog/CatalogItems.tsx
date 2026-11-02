import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { observer } from "mobx-react-lite";
import styled from "styled-components";
import nativeStyled, { useTheme } from "styled-components/native";
import { itemGallery } from "../../models/catalog";
import type { LearningItem } from "../../models/catalog";
import type { CatalogStore } from "./CatalogStore";
import { Body, Button, ButtonText, Row } from "../../ui/primitives";
import { Check, IconButton, WebLink } from "../../ui/browserControls";
import { Icon } from "../../ui/Icon";
import { assetUrl, itemUrl } from "../../ui/browserMedia";

const TableScroll = styled.div`
	overflow-x: auto;
`;
const Table = styled.table`
	width: 100%;
	min-width: 760px;
	table-layout: fixed;
	border-collapse: collapse;
	text-align: right;
	th {
		font: 10px ${({ theme }) => theme.font};
		color: ${({ theme }) => theme.muted};
		height: 40px;
		background: #fcfdfc;
	}
	td {
		border-top: 1px solid ${({ theme }) => theme.border};
		padding: 17px 7px;
		font: 11px ${({ theme }) => theme.font};
	}
	.check {
		width: 43px;
		padding-right: 21px;
	}
	.name {
		width: 42%;
	}
	.format {
		width: 17%;
	}
	.scope {
		width: 14%;
	}
	.featured {
		width: 8%;
		text-align: center;
	}
	.actions {
		width: 70px;
	}
	tbody tr:hover {
		background: #fbfcfc;
	}
`;
const TitleButton = styled.button`
	padding: 0;
	border: 0;
	background: transparent;
	text-align: right;
	color: ${({ theme }) => theme.text};
	font: 12px/1.7 ${({ theme }) => theme.font};
	max-width: 100%;
	cursor: pointer;
	&:hover {
		color: ${({ theme }) => theme.primary};
		text-decoration: underline;
	}
`;
const Tag = styled.span<{ $gallery?: string; $video?: boolean }>`
	display: inline-flex;
	gap: 4px;
	align-items: center;
	white-space: ${({ $gallery }) => ($gallery ? "normal" : "nowrap")};
	overflow-wrap: anywhere;
	max-width: 100%;
	border-radius: 4px;
	padding: 5px 7px;
	font: 10px ${({ theme }) => theme.font};
	color: ${({ $gallery, $video }) => ($video ? "#aa8e58" : $gallery === "team" ? "#7d94ad" : $gallery === "study" ? "#9b89b2" : $gallery === "none" ? "#9d977f" : "#75917d")};
	background: ${({ $gallery, $video }) => ($video ? "#faf4e9" : $gallery === "team" ? "#eef2f6" : $gallery === "study" ? "#f3f0f7" : $gallery === "none" ? "#f4f3ef" : "#eef4f0")};
`;
const Card = nativeStyled.View`
	border-width: 1px; border-color: ${({ theme }) => theme.border}; border-radius: 8px; overflow: hidden; background-color: ${({ theme }) => theme.surface};
`;
function Poster({ item, large = false }: { item: LearningItem; large?: boolean }) {
	const [broken, setBroken] = useState(false);
	const uri = assetUrl(item.poster);
	useEffect(() => setBroken(false), [uri]);
	const style = large
		? { width: "100%" as const, aspectRatio: 16 / 9 }
		: { width: 81, height: 48, borderRadius: 5 };
	return uri && !broken ? (
		<Image
			source={{ uri }}
			style={style}
			resizeMode="cover"
			accessibilityLabel={`תצוגה מקדימה: ${item.title}`}
			onError={() => setBroken(true)}
		/>
	) : (
		<View
			style={[
				style,
				{ backgroundColor: "#142b3b", alignItems: "center", justifyContent: "center" },
			]}
		>
			<Icon name="slides" />
		</View>
	);
}
function Formats({ item }: { item: LearningItem }) {
	return (
		<Row style={{ gap: 5, flexWrap: "wrap" }}>
			{item.deck && (
				<Tag>
					<Icon name="slides" size={11} />
					מצגת
				</Tag>
			)}
			{item.video && (
				<Tag $video>
					<Icon name="play" size={11} color="#aa8e58" />
					וידאו
				</Tag>
			)}
			{!item.deck && !item.video && <Tag>ללא מדיה</Tag>}
		</Row>
	);
}
const Scope = observer(function Scope({
	item,
	store,
}: {
	item: LearningItem;
	store: CatalogStore;
}) {
	return <Tag $gallery={itemGallery(item)}>• {store.galleryName(itemGallery(item))}</Tag>;
});
const FeaturedButton = observer(function FeaturedButton({
	item,
	store,
}: {
	item: LearningItem;
	store: CatalogStore;
}) {
	return (
		<IconButton
			type="button"
			disabled={store.saving}
			aria-label={`${item.featured ? "ביטול המלצה על" : "סימון כמומלץ:"} ${item.title}`}
			aria-pressed={item.featured}
			onClick={() => void store.toggleFeatured(item.id)}
		>
			<Icon name="star" size={17} color={item.featured ? "#c7a160" : "#ccd6d7"} />
		</IconButton>
	);
});
export const CatalogItems = observer(function CatalogItems({
	store,
	onEdit,
	columns,
}: {
	store: CatalogStore;
	onEdit(item: LearningItem): void;
	columns: number;
}) {
	const theme = useTheme();
	if (!store.visibleItems.length)
		return (
			<View style={{ padding: 60, alignItems: "center", gap: 15 }}>
				<Icon name="search" size={32} />
				<Body>לא נמצאו תכנים מתאימים</Body>
				<Button $secondary onPress={store.reset} accessibilityRole="button">
					<ButtonText $secondary>ניקוי מסננים</ButtonText>
				</Button>
			</View>
		);
	if (store.layout === "grid")
		return (
			<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18, padding: 22 }}>
				{store.visibleItems.map((item) => (
					<Card
						key={item.id}
						style={{ width: columns === 1 ? "100%" : columns === 2 ? "47%" : "31%" }}
					>
						<Poster item={item} large />
						<View style={{ padding: 16, gap: 12 }}>
							<Row style={{ alignItems: "flex-start", gap: 8 }}>
								<Check
									checked={store.selected.includes(item.id)}
									aria-label={`בחירת ${item.title}`}
									onChange={() => store.toggleSelection(item.id)}
								/>
								<TitleButton onClick={() => onEdit(item)}>{item.title}</TitleButton>
							</Row>
							<Body style={{ fontSize: 11 }}>
								{item.category} · {item.slides} שקפים
							</Body>
							<Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
								<Formats item={item} />
								<Scope item={item} store={store} />
							</Row>
							<Row
								style={{
									justifyContent: "space-between",
									borderTopWidth: 1,
									borderTopColor: theme.border,
									paddingTop: 9,
								}}
							>
								<Button
									$secondary
									accessibilityRole="button"
									onPress={() => onEdit(item)}
									style={{
										minHeight: 32,
										paddingVertical: 6,
										paddingHorizontal: 10,
									}}
								>
									<ButtonText $secondary>עריכת תוכן</ButtonText>
								</Button>
								<FeaturedButton item={item} store={store} />
								{(item.deck || item.video) && (
									<WebLink
										href={itemUrl(item, store.galleries)}
										target="_blank"
										rel="noopener noreferrer"
										aria-label={`צפייה בגרסה הציבורית של ${item.title}`}
									>
										<Icon name="external" size={15} />
									</WebLink>
								)}
							</Row>
						</View>
					</Card>
				))}
			</View>
		);
	return (
		<TableScroll>
			<Table>
				<thead>
					<tr>
						<th className="check">
							<Check
								checked={store.allVisibleSelected}
								aria-label="בחירת כל התכנים בתצוגה"
								onChange={store.toggleAllVisible}
							/>
						</th>
						<th className="name">התוכן</th>
						<th className="format">פורמט</th>
						<th className="scope">ספרייה</th>
						<th className="featured">מומלץ</th>
						<th className="actions">
							<span aria-label="פעולות" />
						</th>
					</tr>
				</thead>
				<tbody>
					{store.visibleItems.map((item) => (
						<tr key={item.id}>
							<td className="check">
								<Check
									checked={store.selected.includes(item.id)}
									aria-label={`בחירת ${item.title}`}
									onChange={() => store.toggleSelection(item.id)}
								/>
							</td>
							<td>
								<Row style={{ gap: 12 }}>
									<Poster item={item} />
									<View style={{ flex: 1, minWidth: 0, gap: 4 }}>
										<TitleButton onClick={() => onEdit(item)}>
											{item.title}
										</TitleButton>
										<Body style={{ fontSize: 10, lineHeight: 17 }}>
											{item.category} · {item.slides} שקפים
											{item.duration
												? ` · ${Math.ceil(item.duration / 60)} דק׳`
												: ""}
										</Body>
									</View>
								</Row>
							</td>
							<td>
								<Formats item={item} />
							</td>
							<td>
								<Scope item={item} store={store} />
							</td>
							<td className="featured">
								<FeaturedButton item={item} store={store} />
							</td>
							<td>
								<Row style={{ gap: 0, justifyContent: "flex-end" }}>
									<IconButton
										aria-label={`עריכת ${item.title}`}
										onClick={() => onEdit(item)}
									>
										<Icon name="edit" size={15} />
									</IconButton>
									{(item.deck || item.video) && (
										<WebLink
											href={itemUrl(item, store.galleries)}
											target="_blank"
											rel="noopener noreferrer"
											aria-label={`צפייה בגרסה הציבורית של ${item.title}`}
										>
											<Icon name="external" size={14} />
										</WebLink>
									)}
								</Row>
							</td>
						</tr>
					))}
				</tbody>
			</Table>
		</TableScroll>
	);
});
