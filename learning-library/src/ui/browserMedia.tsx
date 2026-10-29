import type { ReactNode } from "react";
import { useTheme } from "styled-components/native";
import { publicUrl } from "../core/browserRepository";

// Browser media is kept at this boundary; feature state and screens use semantic props.
export function MediaFrame({
	path,
	title,
	kind,
}: {
	path: string;
	title: string;
	kind: "deck" | "video";
}) {
	const theme = useTheme();
	return (
		<iframe
			key={path}
			src={publicUrl(path)}
			title={title}
			allow="fullscreen; picture-in-picture"
			allowFullScreen
			style={{
				height: kind === "deck" ? "min(76vh, 780px)" : "82vh",
				minHeight: kind === "deck" ? 260 : 620,
				background: theme.background,
				borderRadius: 10,
			}}
		/>
	);
}

export function WebLink({
	path,
	children,
	download = false,
	label,
	primary = false,
}: {
	path: string;
	children: ReactNode;
	download?: boolean;
	label?: string;
	primary?: boolean;
}) {
	const theme = useTheme();
	return (
		<a
			href={publicUrl(path)}
			target={download ? undefined : "_blank"}
			rel="noreferrer"
			download={download || undefined}
			aria-label={label}
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 8,
				minHeight: 44,
				padding: "10px 12px",
				fontFamily: "Rubik",
				fontSize: 13,
				borderRadius: 8,
				...(primary
					? {
							background: theme.primary,
							color: theme.primaryText,
							fontWeight: 600,
							padding: "12px 16px",
						}
					: {}),
			}}
		>
			{children}
		</a>
	);
}
