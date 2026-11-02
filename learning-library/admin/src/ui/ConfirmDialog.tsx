import { ModalDialog, DialogBody, DialogFooter } from "./ModalDialog";
import { FormButton, FormError } from "./browserControls";

export function ConfirmDialog({
	open,
	title,
	description,
	label,
	busy = false,
	error,
	onClose,
	onConfirm,
}: {
	open: boolean;
	title: string;
	description: string;
	label: string;
	busy?: boolean;
	error?: string | null;
	onClose(): void;
	onConfirm(): void;
}) {
	return (
		<ModalDialog open={open} title={title} description={description} onClose={onClose}>
			{error && (
				<DialogBody>
					<FormError role="alert">{error}</FormError>
				</DialogBody>
			)}
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
