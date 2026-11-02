import { useState } from "react";
import { Image, View } from "react-native";
import { observer } from "mobx-react-lite";
import styled from "styled-components/native";
import webStyled from "styled-components";
import type { AdminView, GalleryDefinition } from "../models/catalog";
import { Body, Label, Row } from "./primitives";
import { Icon, type IconName } from "./Icon";
import { WebLink } from "./browserControls";
import { viewNames } from "../features/catalog/galleries";

const SidebarViewport = webStyled.nav<{ $compact: boolean }>`
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
	align-self: ${({ $compact }) => ($compact ? "stretch" : "flex-start")};
	position: ${({ $compact }) => ($compact ? "static" : "sticky")};
	top: 0;
	width: ${({ $compact }) => ($compact ? "100%" : "246px")};
	height: ${({ $compact }) => ($compact ? "auto" : "100vh")};
	height: ${({ $compact }) => ($compact ? "auto" : "100dvh")};
	overflow-y: ${({ $compact }) => ($compact ? "visible" : "auto")};
`;
const SidebarPanel = styled.View`
	background-color: ${({ theme }) => theme.nav};
	padding: 30px 20px 20px;
`;
const NavItem = styled.Pressable<{ $selected: boolean }>`
	flex-direction: row;
	align-items: center;
	gap: 12px;
	padding: 13px 12px;
	margin-bottom: 4px;
	border-radius: 7px;
	background-color: ${({ $selected }) => ($selected ? "#2b414c" : "transparent")};
`;
const galleryIcons: Record<string, IconName> = {
	public: "globe",
	team: "users",
	study: "book",
	none: "link",
};
export const Sidebar = observer(function Sidebar({
	view,
	count,
	compact,
	galleries,
	busy,
	onManage,
	onCreatorTools,
	onNavigate,
	sourcesOpen,
	onSources,
}: {
	view: AdminView;
	count: number;
	compact: boolean;
	galleries: GalleryDefinition[];
	busy: boolean;
	sourcesOpen: boolean;
	onSources(): void;
	onManage(): void;
	onCreatorTools(): void;
	onNavigate(view: AdminView): void;
}) {
	const [expanded, setExpanded] = useState(false);
	const entries: [AdminView, IconName, string][] = [
		["all", "library", viewNames.all!],
		...galleries.map((gallery): [AdminView, IconName, string] => [
			gallery.id,
			Object.hasOwn(galleryIcons, gallery.id) ? galleryIcons[gallery.id]! : "book",
			gallery.name,
		]),
		["featured", "star", viewNames.featured!],
		["history", "history", viewNames.history!],
	];
	return (
		<SidebarViewport $compact={compact} aria-label="ניווט ראשי">
			<SidebarPanel style={compact ? { paddingVertical: 17 } : { minHeight: "100%" }}>
				<Row style={{ gap: 12, marginBottom: compact ? 0 : 33 }}>
					<Image
						source={{ uri: "/library/brand/logo.png" }}
						style={{ width: 37, height: 44 }}
						resizeMode="contain"
						accessibilityLabel="סמל דה וינצ׳י"
					/>
					<View style={{ flex: 1, gap: 4 }}>
						<Label style={{ fontSize: 17, color: "#f1f5f5" }}>דה וינצ׳י 4744</Label>
						<Body style={{ fontSize: 10, lineHeight: 16, color: "#81959f" }}>
							סביבת ניהול התוכן
						</Body>
					</View>
					{compact && (
						<NavItem
							$selected={false}
							accessibilityRole="button"
							accessibilityLabel="תפריט ניווט"
							accessibilityState={{ expanded }}
							onPress={() => setExpanded(!expanded)}
							style={{ padding: 5 }}
						>
							<Icon name="list" color="#c6d0d3" />
						</NavItem>
					)}
				</Row>
				{(!compact || expanded) && (
					<View style={{ marginTop: compact ? 20 : 0, gap: 4 }}>
						{entries.map(([key, icon, name]) => (
							<View key={key}>
								{key === "public" && (
									<Body
										style={{
											fontSize: 10,
											color: "#7f96a1",
											paddingHorizontal: 12,
											marginTop: 22,
											marginBottom: 12,
										}}
									>
										הספריות שלכם
									</Body>
								)}
								{key === "featured" && (
									<>
										<NavItem
											$selected={false}
											disabled={busy}
											accessibilityRole="button"
											onPress={onManage}
										>
											<Icon name="edit" size={16} color="#99afb9" />
											<Body style={{ fontSize: 12, color: "#aabfc8" }}>
												ניהול ספריות
											</Body>
										</NavItem>
										<View
											style={{
												height: 1,
												backgroundColor: "#2b3d46",
												marginVertical: 18,
												marginHorizontal: 12,
											}}
										/>
									</>
								)}
								<NavItem
									$selected={!sourcesOpen && view === key}
									accessibilityRole="button"
									accessibilityState={{ selected: !sourcesOpen && view === key }}
									onPress={() => {
										onNavigate(key);
										setExpanded(false);
									}}
								>
									<Icon
										name={icon}
										size={18}
										color={!sourcesOpen && view === key ? "#edf4f5" : "#99afb9"}
									/>
									<Body
										style={{
											fontSize: 12,
											color:
												!sourcesOpen && view === key
													? "#f4f8f8"
													: "#aabfc8",
											flex: 1,
										}}
									>
										{name}
									</Body>
									{key === "all" && (
										<Label style={{ color: "#d4e2e5", fontSize: 10 }}>
											{count}
										</Label>
									)}
								</NavItem>
							</View>
						))}
						<NavItem
							$selected={sourcesOpen}
							accessibilityRole="button"
							accessibilityState={{ selected: sourcesOpen }}
							onPress={() => {
								onSources();
								setExpanded(false);
							}}
						>
							<Icon
								name="image"
								size={18}
								color={sourcesOpen ? "#edf4f5" : "#99afb9"}
							/>
							<Body
								style={{ fontSize: 12, color: sourcesOpen ? "#f4f8f8" : "#aabfc8" }}
							>
								מקורות
							</Body>
						</NavItem>
					</View>
				)}
				{!compact && (
					<View style={{ marginTop: "auto", paddingTop: 24 }}>
						<WebLink
							href="https://knowledge.davinci4744.com/"
							target="_blank"
							rel="noopener noreferrer"
							style={{
								color: "#a6b8bf",
								justifyContent: "space-between",
								padding: "22px 4px",
							}}
						>
							פתיחת ספריית הלמידה
							<Icon name="external" size={15} color="#a6b8bf" />
						</WebLink>
						<NavItem
							$selected={false}
							accessibilityRole="button"
							onPress={onCreatorTools}
							style={{
								justifyContent: "center",
								backgroundColor: "#203640",
								borderWidth: 1,
								borderColor: "#2c424d",
								marginBottom: 0,
							}}
						>
							<Icon name="download" size={17} color="#c6d0d3" />
							<Body style={{ fontSize: 12, color: "#c6d0d3" }}>הורדת הסקילים</Body>
						</NavItem>
					</View>
				)}
			</SidebarPanel>
		</SidebarViewport>
	);
});
