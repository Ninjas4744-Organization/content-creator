import { observer } from "mobx-react-lite";
import { View } from "react-native";
import { isFixedGallery, type GalleryDefinition, type GallerySection } from "../../models/catalog";
import { IconButton } from "../../ui/browserControls";
import { Chip, ChipText, Label, Row } from "../../ui/primitives";
import { Icon } from "../../ui/Icon";
import type { CatalogStore } from "./CatalogStore";
import { galleryGroups } from "./galleries";

export const GalleryTabs = observer(function GalleryTabs({
	store,
	compact,
	onOpenDialog,
}: {
	store: CatalogStore;
	compact: boolean;
	onOpenDialog(gallery?: GalleryDefinition, section?: GallerySection): void;
}) {
	const busy = store.loading || store.saving;
	return (
		<View style={{ gap: 8, flexShrink: 1, paddingVertical: 8 }}>
			{galleryGroups.map(({ section, label, addLabel }) => (
				<Row key={label} style={{ gap: compact ? 4 : 10, flexWrap: "wrap" }}>
					<Label style={{ minWidth: 86 }}>{label}</Label>
					{!section && (
						<Chip
							$selected={store.gallery === "all"}
							accessibilityRole="button"
							aria-pressed={store.gallery === "all"}
							onPress={() => store.setGallery("all")}
						>
							<ChipText $selected={store.gallery === "all"}>הכול</ChipText>
						</Chip>
					)}
					{store.galleries
						.filter(
							(gallery) => (gallery.section === "course") === (section === "course"),
						)
						.map((gallery) => {
							const { id, name } = gallery;
							const selected = store.gallery === id;
							const fixed = isFixedGallery(id);
							const action = `${fixed ? "פרטי הספרייה" : "עריכת הספרייה"} ${name}`;
							return (
								<Row key={id} style={{ gap: 0, maxWidth: "100%" }}>
									<Chip
										$selected={selected}
										accessibilityRole="button"
										aria-pressed={selected}
										onPress={() => store.setGallery(id)}
										style={{ flexShrink: 1 }}
									>
										<ChipText $selected={selected}>{name}</ChipText>
									</Chip>
									<IconButton
										type="button"
										aria-label={action}
										aria-haspopup="dialog"
										title={action}
										disabled={busy}
										onClick={() => onOpenDialog(gallery)}
									>
										<Icon name={fixed ? "info" : "edit"} size={15} />
									</IconButton>
								</Row>
							);
						})}
					<IconButton
						$selected
						type="button"
						aria-label={addLabel}
						aria-haspopup="dialog"
						title={addLabel}
						disabled={busy}
						onClick={() => onOpenDialog(undefined, section)}
					>
						<Icon name="plus" size={18} />
					</IconButton>
				</Row>
			))}
		</View>
	);
});
