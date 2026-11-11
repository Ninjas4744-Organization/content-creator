import type { GalleryDefinition } from "../../models/catalog";
import { galleryGroups } from "./galleries";

export function GalleryOptions({ galleries }: { galleries: readonly GalleryDefinition[] }) {
	return galleryGroups.map(({ section, label }) => {
		const entries = galleries.filter(
			(gallery) => (gallery.section === "course") === (section === "course"),
		);
		return (
			entries.length > 0 && (
				<optgroup key={label} label={label}>
					{entries.map(({ id, name }) => (
						<option key={id} value={id}>
							{name}
						</option>
					))}
				</optgroup>
			)
		);
	});
}
