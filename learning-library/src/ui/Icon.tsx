import { useTheme } from "styled-components/native";

const paths = {
	play: "m9 5 11 7-11 7V5Z",
	slides: "M3 4h18v13H3z M8 21l4-4 4 4 M12 17v4",
	search: "M21 21l-5-5 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0",
	arrow: "M19 12H5 M11 6l-6 6 6 6",
	back: "M5 12h14 M13 6l6 6-6 6",
	external: "M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7",
	clock: "M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
	check: "m5 12 4 4L19 6",
	library: "M4 4v16 M9 4v16 M14 4v16 M18 4l3 16",
	download: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4",
	export: "M12 16V3 M7 8l5-5 5 5 M5 13v8h14v-8",
	copy: "M9 9h12v12H9z M15 9V3H3v12h6",
	close: "m6 6 12 12 M6 18 18 6",
};

export function Icon({
	name,
	size = 20,
	color,
}: {
	name: keyof typeof paths;
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
			stroke={color ?? theme.text}
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0 }}
		>
			<path d={paths[name]} />
		</svg>
	);
}
