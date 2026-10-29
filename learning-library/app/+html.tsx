import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

const basePath = `${(process.env.EXPO_BASE_URL || "").replace(/\/$/, "")}/`;

export default function RootHtml({ children }: PropsWithChildren) {
	return (
		<html lang="he" dir="rtl">
			<head>
				<meta charSet="utf-8" />
				<base href={basePath} />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="theme-color" content="#081525" />
				<meta
					name="description"
					content="ספריית הלמידה של דה וינצ׳י 4744 — מצגות וסרטונים אינטראקטיביים לקהילת FIRST."
				/>
				<ScrollViewStyleReset />
			</head>
			<body>{children}</body>
		</html>
	);
}
