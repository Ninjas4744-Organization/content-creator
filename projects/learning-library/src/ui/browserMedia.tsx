import { useEffect, useRef, type ReactNode } from "react";
import { useTheme } from "styled-components/native";
import { publicUrl } from "../core/browserRepository";
import type { LearningProgress } from "../features/lti/LtiClient";

// Browser media is kept at this boundary; feature state and screens use semantic props.
export function MediaFrame({
	path,
	title,
	kind,
	onProgress,
}: {
	path: string;
	title: string;
	kind: "deck" | "video";
	onProgress?(event: LearningProgress): void;
}) {
	const theme = useTheme();
	const frame = useRef<HTMLIFrameElement>(null);
	useEffect(() => {
		if (!onProgress) return;
		const receive = (event: MessageEvent) => {
			if (
				event.origin !== window.location.origin ||
				event.source !== frame.current?.contentWindow
			)
				return;
			const data = event.data;
			if (data?.type !== "davinci-learning") return;
			if (kind === "deck" && data.event === "slide" && Number.isInteger(data.index)) {
				onProgress({ event: "slide", index: data.index });
			} else if (
				kind === "video" &&
				data.event === "video" &&
				Number.isFinite(data.position) &&
				Number.isFinite(data.rate) &&
				typeof data.playing === "boolean"
			) {
				onProgress({
					event: "video",
					position: data.position,
					rate: data.rate,
					playing: data.playing,
				});
			}
		};
		window.addEventListener("message", receive);
		return () => window.removeEventListener("message", receive);
	}, [kind, onProgress]);
	return (
		<iframe
			ref={frame}
			onLoad={() =>
				frame.current?.contentWindow?.postMessage(
					{ type: "davinci-progress-request" },
					window.location.origin,
				)
			}
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
