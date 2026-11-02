import { ModalDialog, DialogFooter } from "./ModalDialog";
import { FormButton } from "./browserControls";

export function ConfirmDialog({
	open,
	title,
	description,
	label,
	busy = false,
	onClose,
	onConfirm,
}: {
	open: boolean;
	title: string;
	description: string;
	label: string;
	busy?: boolean;
	onClose(): void;
	onConfirm(): void;
}) {
	return (
		<ModalDialog open={open} title={title} description={description} onClose={onClose}>
			<DialogFooter>
				<FormButton disabled={busy} onClick={onClose}>
					ביטול
				</FormButton>
				<FormButton $primary disabled={busy} onClick={onConfirm}>
					{label}
				</FormButton>
			</DialogFooter>
		</ModalDialog>
	);
}
