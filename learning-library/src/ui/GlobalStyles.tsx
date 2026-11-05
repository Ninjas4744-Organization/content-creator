import { createGlobalStyle } from "styled-components";
import { theme } from "./theme";

export const GlobalStyles = createGlobalStyle`
  @font-face { font-family: Rubik; src: url('library/brand/Rubik-Regular.ttf') format('truetype'); font-display: swap; }
  @font-face { font-family: RubikBold; src: url('library/brand/Rubik-Bold.ttf') format('truetype'); font-display: swap; }
  html, body, #root { background: ${theme.background}; color: ${theme.text}; min-height: 100%; }
  body { overflow-y: auto; color-scheme: light; }
  * { box-sizing: border-box; }
  a { color: inherit; text-decoration: none; }
  button, input, a, [role=button] { -webkit-tap-highlight-color: transparent; }
  :focus-visible { outline: 3px solid ${theme.accent}; outline-offset: 5px; }
  ::selection { background: ${theme.card}; color: ${theme.text}; }
  .workshop-cover {
    position: relative;
    margin: 24px 0;
    padding: 38px 24px 32px;
    border: 1px solid ${theme.border};
    border-left: 5px solid ${theme.brand};
    border-radius: 14px;
    background:
      linear-gradient(to left, ${theme.background} 40px, transparent 40px),
      ${theme.background} url('workshop/paper.png') no-repeat right -8px top -24px / auto 440px;
  }
  @media (min-width: 900px) {
    .workshop-cover {
      padding: 40px 5% 48px 39%;
      border-left-width: 1px;
      background: linear-gradient(to right, ${theme.brand} 35.625%, ${theme.background} 35.625%);
    }
    .workshop-cover::before {
      content: "";
      position: absolute;
      inset-block: 0;
      left: 0;
      width: 35.625%;
      background: url('library/brand/logo.png') no-repeat center / clamp(90px, 10vw, 132px) auto;
      pointer-events: none;
    }
  }
  iframe { border: 0; width: 100%; height: 100%; display: block; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition: none !important; } }
`;
