import { useEffect, useId, useRef, type ReactNode } from "react";
import styled, { ThemeProvider } from "styled-components";
import { useTheme } from "styled-components/native";
import { IconButton } from "./browserControls";
import { Icon } from "./Icon";

let scrollLocks = 0;
let previousOverflow = "";

const Dialog = styled.dialog`
	width: min(590px, calc(100vw - 28px));
	max-height: calc(100dvh - 36px);
	margin: auto;
	padding: 0;
	border: 1px solid ${({ theme }) => theme.border};
	border-radius: 12px;
	background: ${({ theme }) => theme.surface};
	color: ${({ theme }) => theme.text};
	box-shadow: 0 28px 100px #13283240;
	overscroll-behavior: contain;
	&::backdrop {
		background: #11253066;
		backdrop-filter: blur(3px);
	}
`;
const Header = styled.header`
	position: sticky;
	top: 0;
	z-index: 1;
	background: ${({ theme }) => theme.surface};
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
	padding: 23px 25px;
	border-bottom: 1px solid ${({ theme }) => theme.border};
	h2 {
		margin: 0 0 5px;
		font: 22px/1.4 ${({ theme }) => theme.bold};
	}
	p {
		margin: 0;
		font: 11px/1.8 ${({ theme }) => theme.font};
		color: ${({ theme }) => theme.muted};
	}
`;
export const DialogBody = styled.div`
	padding: 23px 25px;
`;
export const DialogFooter = styled.div`
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: 10px;
	padding: 17px 25px;
	border-top: 1px solid ${({ theme }) => theme.border};
	background: ${({ theme }) => theme.background};
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
		dialog.showModal();
		if (scrollLocks === 0) previousOverflow = document.body.style.overflow;
		scrollLocks++;
		document.body.style.overflow = "hidden";
		return () => {
			dialog.close();
			scrollLocks--;
			if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
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
			>
				<Header>
					<div>
						<h2 id={`${id}-title`}>{title}</h2>
						<p id={`${id}-description`}>{description}</p>
					</div>
					<IconButton type="button" aria-label="סגירת חלון" onClick={onClose}>
						<Icon name="close" size={18} />
					</IconButton>
				</Header>
				{children}
			</Dialog>
		</ThemeProvider>
	);
}
