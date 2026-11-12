import { useState } from "react";
import { Image, View } from "react-native";
import { Link } from "expo-router";
import styled from "styled-components";
import { apiUrl } from "../core/browserRepository";
import { adminSections, type AdminSection } from "../routes/adminNavigation";
import { Body, Label, Row } from "./primitives";
import { Icon } from "./Icon";
import { IconButton, WebLink } from "./browserControls";

const SidebarViewport = styled.nav<{ $compact: boolean }>`
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
	align-self: ${({ $compact }) => ($compact ? "stretch" : "flex-start")};
	position: ${({ $compact }) => ($compact ? "static" : "sticky")};
	inset-block-start: 0;
	width: ${({ $compact }) => ($compact ? "100%" : "246px")};
	height: ${({ $compact }) => ($compact ? "auto" : "100vh")};
	height: ${({ $compact }) => ($compact ? "auto" : "100dvh")};
	overflow-y: ${({ $compact }) => ($compact ? "visible" : "auto")};
	background: ${({ theme }) => theme.nav};
	padding: ${({ $compact }) => ($compact ? "17px 20px" : "30px 20px 20px")};
`;
const NavItem = styled(WebLink)`
	display: flex;
	gap: 12px;
	min-height: 44px;
	padding: 10px 12px;
	border-radius: 7px;
	color: #aabfc8;
	font-size: 12px;
	&:hover,
	&[aria-current="page"] {
		background: #2b414c;
		color: #f4f8f8;
	}
`;
const Download = styled(NavItem)`
	background: #203640;
	border: 1px solid #2c424d;
	margin-block-start: 4px;
`;

export function Sidebar({
	section,
	count,
	compact,
}: {
	section: AdminSection;
	count: number;
	compact: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	return (
		<SidebarViewport $compact={compact} aria-label="ניווט ראשי">
			<Row style={{ gap: 12 }}>
				<Image
					source={{ uri: "/library/brand/logo.png" }}
					style={{ width: 37, height: 44 }}
					resizeMode="contain"
					accessibilityLabel="סמל דה וינצ׳י"
				/>
				<View style={{ flex: 1, gap: 4 }}>
					<Label style={{ fontSize: 17, color: "#f1f5f5" }}>דה וינצ׳י 4744</Label>
					<Body style={{ fontSize: 10, color: "#81959f" }}>סביבת ניהול התוכן</Body>
				</View>
				{compact && (
					<IconButton
						type="button"
						aria-label="תפריט ניווט"
						aria-expanded={expanded}
						onClick={() => setExpanded(!expanded)}
						style={{ color: "#c6d0d3" }}
					>
						<Icon name="list" />
					</IconButton>
				)}
			</Row>
			{(!compact || expanded) && (
				<>
					<View style={{ marginTop: compact ? 20 : 33, gap: 4 }}>
						{Object.entries(adminSections).map(([key, entry]) => (
							<Link
								key={key}
								href={entry.href}
								asChild
								push
								onPress={() => setExpanded(false)}
							>
								<NavItem aria-current={section === key ? "page" : undefined}>
									<Icon name={entry.icon} size={18} color="currentColor" />
									<span style={{ flex: 1 }}>{entry.title}</span>
									{key === "content" && <span>{count}</span>}
								</NavItem>
							</Link>
						))}
					</View>
					<View style={{ marginTop: "auto", paddingTop: 24 }}>
						<NavItem
							href="https://knowledge.davinci4744.com/"
							target="_blank"
							rel="noopener noreferrer"
						>
							<Icon name="external" size={17} color="currentColor" />
							פתיחת ספריית הלמידה
						</NavItem>
						<Download href={apiUrl("/api/creator/kit")} download="davinci-creator.zip">
							<Icon name="download" size={17} color="currentColor" />
							הורדת הסקילים
						</Download>
					</View>
				</>
			)}
		</SidebarViewport>
	);
}
