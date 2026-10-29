import styled from "styled-components/native";

export const Page = styled.View`
	min-height: 100vh;
	background-color: ${({ theme }) => theme.background};
`;
export const Container = styled.View<{ $compact?: boolean }>`
	width: 100%;
	max-width: 1240px;
	align-self: center;
	padding-horizontal: ${({ $compact }) => ($compact ? 22 : 48)}px;
`;
export const Row = styled.View`
	flex-direction: row;
	align-items: center;
	gap: 12px;
`;
export const Body = styled.Text`
	font-family: ${({ theme }) => theme.font};
	font-size: 15px;
	line-height: 25px;
	color: ${({ theme }) => theme.muted};
	text-align: right;
`;
export const Label = styled.Text`
	font-family: ${({ theme }) => theme.bold};
	font-size: 13px;
	line-height: 20px;
	color: ${({ theme }) => theme.text};
	text-align: right;
`;
export const Heading = styled.Text<{ $compact?: boolean }>`
	font-family: ${({ theme }) => theme.bold};
	font-size: ${({ $compact }) => ($compact ? 28 : 36)}px;
	line-height: ${({ $compact }) => ($compact ? 39 : 48)}px;
	color: ${({ theme }) => theme.text};
	text-align: right;
`;
export const Button = styled.Pressable<{ $secondary?: boolean }>`
	flex-direction: row;
	align-items: center;
	justify-content: center;
	min-height: 46px;
	padding: 12px 19px;
	gap: 9px;
	border-radius: 9px;
	border-width: 1px;
	border-color: ${({ theme, $secondary }) => ($secondary ? theme.border : theme.primary)};
	background-color: ${({ theme, $secondary }) => ($secondary ? theme.surface : theme.primary)};
`;
export const ButtonText = styled.Text<{ $secondary?: boolean }>`
	font-family: ${({ theme }) => theme.bold};
	font-size: 14px;
	color: ${({ theme, $secondary }) => ($secondary ? theme.text : theme.primaryText)};
`;
export const Chip = styled.Pressable<{ $selected?: boolean }>`
	min-height: 44px;
	padding: 11px 16px;
	border-radius: 8px;
	border-width: 1px;
	border-color: ${({ theme, $selected }) => ($selected ? theme.blue : theme.border)};
	background-color: ${({ theme, $selected }) => ($selected ? theme.card : "transparent")};
`;
export const ChipText = styled.Text<{ $selected?: boolean }>`
	font-family: ${({ theme }) => theme.font};
	font-size: 13px;
	color: ${({ theme, $selected }) => ($selected ? theme.text : theme.muted)};
`;
