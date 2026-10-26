import { useEffect, useId, useRef, type ReactNode } from "react";
import styled, { ThemeProvider } from "styled-components";
import { useTheme } from "styled-components/native";
import { Icon } from "./Icon";

const Dialog = styled.dialog`
	width: min(580px, calc(100vw - 32px));
	max-height: calc(100dvh - 40px);
	margin: auto;
	padding: 0;
	border: 1px solid ${({ theme }) => theme.border};
	border-radius: 22px;
	background: ${({ theme }) => theme.surface};
	color: ${({ theme }) => theme.text};
	box-shadow: 0 28px 100px #0008;
	overscroll-behavior: contain;
	scrollbar-width: thin;
	scrollbar-color: ${({ theme }) => theme.border} transparent;
	&::backdrop {
		background: #030b16b8;
		backdrop-filter: blur(7px);
	}
	&[open] {
		animation: dialog-enter 160ms ease-out;
	}
	@keyframes dialog-enter {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.985);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	@media (max-width: 600px) {
		width: calc(100vw - 24px);
		max-height: calc(100dvh - 24px);
		border-radius: 18px;
	}
`;
const Header = styled.header`
	position: sticky;
	top: 0;
	z-index: 1;
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 18px;
	padding: 20px 22px;
	border-bottom: 1px solid ${({ theme }) => theme.border};
	background: ${({ theme }) => theme.surface};
	h2 {
		margin: 0 0 5px;
		font: 24px/1.4 ${({ theme }) => theme.bold};
	}
	p {
		margin: 0;
		font: 14px/1.6 ${({ theme }) => theme.font};
		color: ${({ theme }) => theme.muted};
	}
`;
const Close = styled.button`
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 36px;
	height: 36px;
	border: 0;
	border-radius: 9px;
	background: transparent;
	color: inherit;
	cursor: pointer;
	&:hover {
		background: ${({ theme }) => theme.card};
	}
`;

export function ModalDialog({
	open,
	onClose,
	title,
	description,
	children,
}: {
	open: boolean;
	onClose(): void;
	title: string;
	description: string;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const theme = useTheme();
	const id = useId();
	useEffect(() => {
		const dialog = ref.current;
		if (!open || !dialog) return;
		const previousFocus = document.activeElement;
		const previousOverflow = document.body.style.overflow;
		dialog.showModal();
		document.body.style.overflow = "hidden";
		return () => {
			dialog.close();
			document.body.style.overflow = previousOverflow;
			if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
				previousFocus.focus();
		};
	}, [open]);
	return (
		<ThemeProvider theme={theme}>
			<Dialog
				ref={ref}
				dir="rtl"
				aria-labelledby={`${id}-title`}
				aria-describedby={`${id}-description`}
				aria-modal="true"
				onCancel={(event) => {
					event.preventDefault();
					onClose();
				}}
				onClick={(event) => {
					if (event.target !== event.currentTarget) return;
					const bounds = event.currentTarget.getBoundingClientRect();
					if (
						event.clientX < bounds.left ||
						event.clientX > bounds.right ||
						event.clientY < bounds.top ||
						event.clientY > bounds.bottom
					)
						onClose();
				}}
			>
				<Header>
					<div>
						<h2 id={`${id}-title`}>{title}</h2>
						<p id={`${id}-description`}>{description}</p>
					</div>
					<Close type="button" aria-label="סגירת חלון הייצוא" onClick={onClose}>
						<Icon name="close" size={20} />
					</Close>
				</Header>
				{children}
			</Dialog>
		</ThemeProvider>
	);
}
