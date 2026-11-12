import styled from "styled-components";
import { WebLink } from "./browserControls";

export const SectionTabs = styled.nav`
	display: flex;
	flex-wrap: wrap;
	gap: 4px 8px;
	padding: 4px 8px 0;
	border: 1px solid ${({ theme }) => theme.border};
	border-radius: 10px;
	background: ${({ theme }) => theme.surface};
`;

export const SectionTab = styled(WebLink)`
	min-height: 44px;
	padding-inline: 12px;
	border-radius: 5px 5px 0 0;
	border-block-end: 2px solid transparent;
	font-size: 12px;

	&[aria-current="page"] {
		border-block-end-color: ${({ theme }) => theme.primary};
		background: ${({ theme }) => theme.card};
		color: ${({ theme }) => theme.text};
		font-family: ${({ theme }) => theme.bold};
	}
`;
