import { createGlobalStyle } from "styled-components";
import { theme } from "./theme";

export const GlobalStyles = createGlobalStyle`
	@font-face { font-family: Rubik; src: url('/library/brand/Rubik-Regular.ttf') format('truetype'); font-display: swap; }
	@font-face { font-family: RubikBold; src: url('/library/brand/Rubik-Bold.ttf') format('truetype'); font-display: swap; }
	html, body, #root { background: ${theme.background}; color: ${theme.text}; min-height: 100%; }
	body { margin: 0; overflow-y: auto; }
	* { box-sizing: border-box; }
	a { color: inherit; text-decoration: none; }
	button, input, select, textarea { font-family: Rubik, Arial, sans-serif; }
	button, input, a, select, [role=button] { -webkit-tap-highlight-color: transparent; }
	button, select, summary, [role=button] { cursor: pointer; }
	button:disabled { cursor: wait; opacity: .55; }
	:focus-visible { outline: 3px solid ${theme.blue}; outline-offset: 3px; }
	::selection { background: #d8e5e8; color: #14252f; }
	@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition: none !important; } }
`;
