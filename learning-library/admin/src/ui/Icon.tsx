import { useTheme } from "styled-components/native";

const paths = {
	library: "M4 4v16 M9 4v16 M14 4v16 M18 4l3 16",
	globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
	users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M16 3a4 4 0 0 1 0 8",
	book: "M12 5v16 M3 3c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 3-3-3-5-4-9-3Z",
	link: "m10 13 4-4 M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0",
	star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
	history: "M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2",
	spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
	external: "M15 3h6v6 M21 3l-9 9 M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
	plus: "M12 5v14 M5 12h14",
	slides: "M3 3h18v13H3z M8 21l4-5 4 5 M7 8h4 M7 11h8",
	play: "M3 5h18v14H3z M10 9l5 3-5 3Z",
	upload: "M12 16V3 M7 8l5-5 5 5 M4 16v5h16v-5",
	download: "M12 3v13 M7 11l5 5 5-5 M4 16v5h16v-5",
	search: "M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0 M16 16l4 4",
	list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
	grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
	info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 11v5 M12 7h.01",
	close: "m6 6 12 12 M6 18 18 6",
	check: "m5 12 4 4L19 6",
	trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
	edit: "m16 3 5 5 M3 21l5-1L21 7a3.5 3.5 0 0 0-5-5L3 15Z",
	image: "M3 3h18v18H3z M3 16l6-6 7 11 M13 17l3-4 5 6 M17 7h.01",
	refresh: "M20 7v5h-5 M4 17v-5h5 M5 8a8 8 0 0 1 13-3l2 7 M4 12l2 7a8 8 0 0 0 13-3",
};
export type IconName = keyof typeof paths;
export function Icon({
	name,
	size = 20,
	color,
}: {
	name: IconName;
	size?: number;
	color?: string;
}) {
	const theme = useTheme();
	return (
		<svg
			aria-hidden="true"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color ?? theme.muted}
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0 }}
		>
			<path d={paths[name]} />
		</svg>
	);
}
