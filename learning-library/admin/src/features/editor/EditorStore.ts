import { makeAutoObservable, observable } from "mobx";
import { itemGallery, itemTopics, normalizeTopics } from "../../models/catalog";
import type { Gallery, LearningItem } from "../../models/catalog";

export interface EditorFields {
	title: string;
	description: string;
	topics: string;
	gallery: Gallery;
	featured: boolean;
	chapters: string;
}
function fields(item?: LearningItem, topics: readonly string[] = []): EditorFields {
	return {
		title: item?.title ?? "",
		description: item?.description ?? "",
		topics: topics.join("\n"),
		gallery: item ? itemGallery(item) : "none",
		featured: item?.featured ?? false,
		chapters: item?.chapters.join("\n") ?? "",
	};
}
export class EditorStore {
	open = false;
	original: LearningItem | null = null;
	draft: EditorFields = fields();
	private initial = "";
	constructor() {
		makeAutoObservable<this, "initial">(
			this,
			{ original: observable.ref, draft: observable.ref, initial: false },
			{ autoBind: true },
		);
	}
	get dirty() {
		return this.open && this.initial !== JSON.stringify(this.draft);
	}
	edit(item: LearningItem, topics = itemTopics(item)) {
		this.original = item;
		this.draft = fields(item, topics);
		this.initial = JSON.stringify(this.draft);
		this.open = true;
	}
	setField<K extends keyof EditorFields>(key: K, value: EditorFields[K]) {
		this.draft = { ...this.draft, [key]: value };
	}
	close() {
		this.open = false;
	}
	toItem(): LearningItem {
		if (!this.original) throw new Error("No content selected for editing");
		const draft = this.draft;
		return {
			...this.original,
			title: draft.title.trim(),
			description: draft.description.trim(),
			topics: normalizeTopics(draft.topics.split("\n")),
			gallery: draft.gallery,
			unlisted: draft.gallery !== "public",
			featured: draft.featured,
			chapters: draft.chapters
				.split("\n")
				.map((chapter) => chapter.trim())
				.filter(Boolean),
		};
	}
}
