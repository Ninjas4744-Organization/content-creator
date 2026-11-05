import "styled-components/native";

export const theme = {
	background: "#F6F3ED",
	surface: "#FFFEFC",
	card: "#DFE8E7",
	featured: "#E8EEED",
	text: "#243C43",
	muted: "#50636A",
	border: "#D1D9D7",
	controlBorder: "#778A8E",
	brand: "#688590",
	primary: "#4B6872",
	primaryText: "#FFFFFF",
	accent: "#415F69",
	success: "#356754",
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
