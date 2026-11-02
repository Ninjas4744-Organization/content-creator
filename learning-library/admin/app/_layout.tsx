import { Slot } from "expo-router";
import { ThemeProvider } from "styled-components/native";
import { ThemeProvider as WebThemeProvider } from "styled-components";
import { GlobalStyles } from "../src/ui/GlobalStyles";
import { theme } from "../src/ui/theme";

export default function RootLayout() {
	return (
		<ThemeProvider theme={theme}>
			<WebThemeProvider theme={theme}>
				<GlobalStyles />
				<Slot />
			</WebThemeProvider>
		</ThemeProvider>
	);
}
