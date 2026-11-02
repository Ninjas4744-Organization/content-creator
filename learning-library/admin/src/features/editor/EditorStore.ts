import { makeAutoObservable, observable } from "mobx";
import { itemGallery } from "../../models/catalog";
import type { Gallery, LearningItem } from "../../models/catalog";

export interface EditorFields {
	id: string;
	title: string;
	description: string;
	category: string;
	gallery: Gallery;
	featured: boolean;
	chapters: string;
	poster: string;
	deck: string;
	video: string;
	powerpoint: string;
	slides: string;
	duration: string;
	checkpoints: string;
	scormDeck: string;
	scormVideo: string;
}
function fields(item?: LearningItem): EditorFields {
	return {
		id: item?.id ?? "",
		title: item?.title ?? "",
		description: item?.description ?? "",
		category: item?.category ?? "",
		gallery: item ? itemGallery(item) : "none",
		featured: item?.featured ?? false,
		chapters: item?.chapters.join("\n") ?? "",
		poster: item?.poster ?? "",
		deck: item?.deck ?? "",
		video: item?.video ?? "",
		powerpoint: item?.powerpoint ?? "",
		slides: String(item?.slides ?? 0),
		duration: item?.duration == null ? "" : String(item.duration),
		checkpoints: String(item?.checkpoints ?? 0),
		scormDeck: item?.scorm?.deck ?? "",
		scormVideo: item?.scorm?.video ?? "",
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
	edit(item?: LearningItem) {
		this.original = item ?? null;
		this.draft = fields(item);
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
		const draft = this.draft;
		const scorm: LearningItem["scorm"] = {};
		if (draft.scormDeck.trim()) scorm.deck = draft.scormDeck.trim();
		if (draft.scormVideo.trim()) scorm.video = draft.scormVideo.trim();
		return {
			...this.original,
			id: draft.id.trim(),
			title: draft.title.trim(),
			description: draft.description.trim(),
			category: draft.category.trim(),
			gallery: draft.gallery,
			unlisted: draft.gallery !== "public",
			featured: draft.featured,
			chapters: draft.chapters
				.split("\n")
				.map((chapter) => chapter.trim())
				.filter(Boolean),
			poster: draft.poster.trim(),
			deck: draft.deck.trim() || null,
			video: draft.video.trim() || null,
			powerpoint: draft.powerpoint.trim() || null,
			slides: Number(draft.slides),
			duration: draft.duration === "" ? null : Number(draft.duration),
			checkpoints: Number(draft.checkpoints),
			scorm,
		};
	}
}
