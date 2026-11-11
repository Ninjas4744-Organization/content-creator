import styled from "styled-components";
import { galleryHref } from "../../core/galleryRouting";
import { itemGallery, type GalleryDefinition, type LearningItem } from "../../models/catalog";
import { Icon } from "../../ui/Icon";
import { Body, Container, Heading } from "../../ui/primitives";

const Navigation = styled.nav`
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	font-family: ${({ theme }) => theme.bold};
	font-size: 14px;

	a {
		display: flex;
		align-items: center;
		min-height: 44px;
		padding-inline: 14px;
		border-radius: 8px;
	}

	a:hover,
	a[aria-current] {
		background: ${({ theme }) => theme.card};
	}
`;

const DirectoryGrid = styled.ul`
	list-style: none;
	margin: 0;
	padding: 0;
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
	gap: 16px;
`;

const DirectoryCard = styled.a`
	display: flex;
	align-items: center;
	gap: 14px;
	height: 100%;
	padding: 18px;
	border: 1px solid ${({ theme }) => theme.border};
	border-radius: 12px;
	background: ${({ theme }) => theme.surface};

	&:hover {
		border-color: ${({ theme }) => theme.accent};
	}

	span {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	strong {
		font: 17px ${({ theme }) => theme.bold};
	}

	small {
		display: block;
		margin-block-start: 5px;
		font: 13px ${({ theme }) => theme.font};
		color: ${({ theme }) => theme.muted};
	}
`;

export function LibraryNavigation({
	courseDirectory,
	gallery,
}: {
	courseDirectory: boolean;
	gallery?: GalleryDefinition;
}) {
	return (
		<Navigation aria-label="אזורי הספרייה">
			<a
				href="./"
				aria-current={!courseDirectory && gallery?.id === "public" ? "page" : undefined}
			>
				ספרייה ציבורית
			</a>
			<a
				href="?section=course"
				aria-current={
					courseDirectory
						? "page"
						: gallery?.section === "course"
							? "location"
							: undefined
				}
			>
				קורסים
			</a>
		</Navigation>
	);
}

export function GalleryDirectory({
	galleries,
	items,
	compact,
}: {
	galleries: readonly GalleryDefinition[];
	items: readonly LearningItem[];
	compact: boolean;
}) {
	const entries = galleries.filter((gallery) => gallery.section === "course");
	const counts = new Map<string, number>();
	for (const item of items) {
		const id = itemGallery(item);
		counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	return (
		<Container $compact={compact} style={{ paddingVertical: compact ? 32 : 56, gap: 24 }}>
			<Heading accessibilityRole="header" aria-level={1} $compact={compact}>
				קורסים
			</Heading>
			{entries.length ? (
				<DirectoryGrid>
					{entries.map((gallery) => {
						const count = counts.get(gallery.id) ?? 0;
						return (
							<li key={gallery.id}>
								<DirectoryCard href={galleryHref(gallery, document.baseURI)}>
									<Icon name="book" size={24} />
									<span>
										<strong>{gallery.name}</strong>
										<small>
											{count} {count === 1 ? "שיעור" : "שיעורים"}
										</small>
									</span>
									<Icon name="arrow" size={18} />
								</DirectoryCard>
							</li>
						);
					})}
				</DirectoryGrid>
			) : (
				<Body>עדיין אין קורסים בספרייה.</Body>
			)}
		</Container>
	);
}
