import "styled-components/native";

export const theme = {
	background: "#081525",
	surface: "#0e2034",
	card: "#12283f",
	featured: "#10263c",
	featuredBorder: "#3c5670",
	text: "#FAFCFF",
	muted: "#a9bfd1",
	border: "#2c465e",
	primary: "#FFDA9D",
	primaryText: "#182332",
	blue: "#A9D8F6",
	success: "#9cddc4",
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
