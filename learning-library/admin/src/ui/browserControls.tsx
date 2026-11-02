import styled from "styled-components";

export const Select = styled.select`
	border: 1px solid ${({ theme }) => theme.border};
	border-radius: 6px;
	background: ${({ theme }) => theme.surface};
	color: ${({ theme }) => theme.muted};
	font-size: 11px;
	padding: 9px 10px;
	min-height: 38px;
	max-width: 190px;
`;
export const Check = styled.input.attrs({ type: "checkbox" })`
	accent-color: ${({ theme }) => theme.primary};
	width: 14px;
	height: 14px;
	cursor: pointer;
	flex-shrink: 0;
`;
export const IconButton = styled.button<{ $selected?: boolean }>`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 5px;
	background: ${({ theme, $selected }) => ($selected ? theme.card : "transparent")};
	color: ${({ theme }) => theme.primary};
	flex-shrink: 0;
	&:hover {
		background: ${({ theme }) => theme.card};
	}
`;
export const WebLink = styled.a`
	display: inline-flex;
	align-items: center;
	gap: 7px;
	color: ${({ theme }) => theme.muted};
	font: 11px/1.6 ${({ theme }) => theme.font};
	padding: 8px;
	border-radius: 5px;
	&:hover {
		background: ${({ theme }) => theme.card};
	}
`;
export const Field = styled.label`
	display: flex;
	flex-direction: column;
	gap: 7px;
	margin-bottom: 17px;
	font: 12px/1.7 ${({ theme }) => theme.font};
	color: ${({ theme }) => theme.muted};
	input,
	textarea,
	select {
		width: 100%;
		border: 1px solid ${({ theme }) => theme.border};
		border-radius: 6px;
		padding: 10px 12px;
		color: ${({ theme }) => theme.text};
		background: white;
		font-size: 13px;
	}
	textarea {
		resize: vertical;
		line-height: 1.8;
	}
	input:read-only {
		background: ${({ theme }) => theme.background};
		color: ${({ theme }) => theme.muted};
	}
	small {
		font-size: 10px;
		color: ${({ theme }) => theme.muted};
	}
`;
export const FormRow = styled.div`
	display: flex;
	gap: 14px;
	> label {
		flex: 1;
		min-width: 0;
	}
	@media (max-width: 400px) {
		flex-wrap: wrap;
		> label {
			flex-basis: 100%;
		}
	}
`;
export const FormButton = styled.button<{ $primary?: boolean; $danger?: boolean }>`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-height: 38px;
	padding: 9px 14px;
	border: 1px solid ${({ theme }) => theme.border};
	border-radius: 6px;
	font: 12px ${({ theme }) => theme.font};
	background: ${({ theme, $primary }) => ($primary ? theme.primary : theme.surface)};
	color: ${({ theme, $primary, $danger }) => ($primary ? theme.primaryText : $danger ? theme.danger : theme.text)};
`;
export const FormError = styled.p`
	font: 12px/1.8 ${({ theme }) => theme.font};
	color: ${({ theme }) => theme.danger};
`;
