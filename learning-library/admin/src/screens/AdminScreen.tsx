import type { PropsWithChildren } from "react";
import { View } from "react-native";
import { useTheme } from "styled-components/native";
import { Sidebar } from "../ui/Sidebar";
import { Body, Label, Page, Row } from "../ui/primitives";
import { WebLink } from "../ui/browserControls";
import { apiUrl } from "../core/browserRepository";
import { adminSections, type AdminSection } from "../routes/adminNavigation";

export function AdminScreen({
	children,
	section,
	compact,
	count,
	production,
	workspaceLabel,
}: PropsWithChildren<{
	section: AdminSection;
	compact: boolean;
	count: number;
	production: boolean;
	workspaceLabel: string;
}>) {
	const theme = useTheme();
	return (
		<Page style={{ flexDirection: compact ? "column" : "row" }}>
			<Sidebar compact={compact} section={section} count={count} />
			<View style={{ flex: 1, minWidth: 0 }}>
				<Row
					style={{
						backgroundColor: theme.surface,
						borderBottomWidth: 1,
						borderBottomColor: theme.border,
						paddingHorizontal: compact ? 19 : 38,
						minHeight: compact ? 54 : 64,
						justifyContent: "space-between",
						flexWrap: "wrap",
						alignContent: "center",
					}}
				>
					<Row style={{ gap: 10 }}>
						<Body style={{ fontSize: 11 }}>מרחב העבודה</Body>
						<Body>/</Body>
						<Label style={{ fontSize: 11 }}>{adminSections[section].title}</Label>
					</Row>
					<Row style={{ gap: 12 }}>
						<Body style={{ fontSize: 10, color: theme.success }}>
							• {workspaceLabel}
						</Body>
						{production && (
							<WebLink
								href={apiUrl("/auth/account")}
								target="_blank"
								rel="noreferrer"
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
						paddingTop: compact ? 24 : 36,
						width: "100%",
						maxWidth: 1450,
						alignSelf: "center",
						gap: 22,
					}}
				>
					{children}
				</View>
			</View>
		</Page>
	);
}
