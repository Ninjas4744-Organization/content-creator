import "styled-components/native";

export const theme = {
	background: "#f7f8f7",
	surface: "#ffffff",
	card: "#eef3f2",
	text: "#25373e",
	muted: "#788d94",
	border: "#e3eae7",
	primary: "#688590",
	primaryText: "#ffffff",
	blue: "#8aafb9",
	success: "#7b9e85",
	nav: "#14252f",
	gold: "#c5a064",
	danger: "#a66c65",
	font: "Rubik",
	bold: "RubikBold",
};

type AppTheme = typeof theme;
declare module "styled-components" {
	export interface DefaultTheme extends AppTheme {}
}
declare module "styled-components/native" {
	export interface DefaultTheme extends AppTheme {}
}
