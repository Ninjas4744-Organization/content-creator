import styled from "styled-components/native";

export const Page = styled.View`
	min-height: 100vh;
	background-color: ${({ theme }) => theme.background};
`;
export const Row = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 12px;
`;
export const Body = styled.Text`
	font-family: ${({ theme }) => theme.font};
	font-size: 12px;
	line-height: 21px;
	color: ${({ theme }) => theme.muted};
	text-align: right;
`;
export const Label = styled.Text`
	font-family: ${({ theme }) => theme.bold};
	font-size: 13px;
	line-height: 21px;
	color: ${({ theme }) => theme.text};
	text-align: right;
`;
export const Heading = styled.Text<{ $compact?: boolean }>`
	font-family: ${({ theme }) => theme.bold};
	font-size: ${({ $compact }) => ($compact ? 25 : 31)}px;
	line-height: 44px;
	color: ${({ theme }) => theme.text};
	text-align: right;
`;
export const Button = styled.Pressable<{ $secondary?: boolean }>`
	flex-direction: row;
	align-items: center;
	justify-content: center;
	min-height: 40px;
	padding: 10px 15px;
	gap: 8px;
	border-radius: 6px;
	border-width: 1px;
	border-color: ${({ theme, $secondary }) => ($secondary ? theme.border : theme.primary)};
	background-color: ${({ theme, $secondary }) => ($secondary ? theme.surface : theme.primary)};
`;
export const ButtonText = styled.Text<{ $secondary?: boolean }>`
	font-family: ${({ theme }) => theme.font};
	font-size: 12px;
	color: ${({ theme, $secondary }) => ($secondary ? theme.text : theme.primaryText)};
`;
export const Chip = styled.Pressable<{ $selected?: boolean }>`
	padding: 11px 9px;
	border-bottom-width: 2px;
	border-bottom-color: ${({ theme, $selected }) => ($selected ? theme.primary : "transparent")};
`;
export const ChipText = styled.Text<{ $selected?: boolean }>`
	font-family: ${({ theme }) => theme.font};
	font-size: 11px;
	color: ${({ theme, $selected }) => ($selected ? theme.primary : theme.muted)};
`;
