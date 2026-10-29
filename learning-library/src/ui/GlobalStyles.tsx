import { createGlobalStyle } from "styled-components";
import { theme } from "./theme";

export const GlobalStyles = createGlobalStyle`
  @font-face { font-family: Rubik; src: url('library/brand/Rubik-Regular.ttf') format('truetype'); font-display: swap; }
  @font-face { font-family: RubikBold; src: url('library/brand/Rubik-Bold.ttf') format('truetype'); font-display: swap; }
  html, body, #root { background: ${theme.background}; color: ${theme.text}; min-height: 100%; }
  body { overflow-y: auto; }
  * { box-sizing: border-box; }
  a { color: inherit; text-decoration: none; }
  button, input, a, [role=button] { -webkit-tap-highlight-color: transparent; }
  :focus-visible { outline: 3px solid ${theme.blue}; outline-offset: 5px; }
  ::selection { background: #ffda9d; color: #081525; }
  iframe { border: 0; width: 100%; height: 100%; display: block; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition: none !important; } }
`;
