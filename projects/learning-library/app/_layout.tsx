import { Slot } from "expo-router";
import { ThemeProvider } from "styled-components/native";
import { GlobalStyles } from "../src/ui/GlobalStyles";
import { theme } from "../src/ui/theme";

export default function RootLayout() {
	return (
		<ThemeProvider theme={theme}>
			<GlobalStyles />
			<Slot />
		</ThemeProvider>
	);
}
