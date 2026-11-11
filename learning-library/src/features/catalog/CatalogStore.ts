import { makeAutoObservable, observable, runInAction } from "mobx";
import { resolveGallery } from "../../core/galleryRouting";
import { itemGallery, itemTopics } from "../../models/catalog";
import type {
	CatalogRepository,
	GalleryScope,
	GalleryDefinition,
	LearningItem,
	MediaFilter,
} from "../../models/catalog";

export class CatalogStore {
	items: LearningItem[] = [];
	galleries: GalleryDefinition[] = [];
	query = "";
	filter: MediaFilter = "all";
	topic: string | null = null;
	loading = true;
	error: string | null = null;
	private generation = 0;

	constructor(
		private readonly repository: CatalogRepository,
		readonly selector: GalleryScope = "public",
	) {
		makeAutoObservable<this, "repository" | "generation">(
			this,
			{
				repository: false,
				selector: false,
				galleries: observable.ref,
				generation: false,
				items: observable.ref,
			},
			{ autoBind: true },
		);
	}

	get galleryDefinition() {
		return (
			this.galleries.find(
				(gallery) => gallery.id === this.selector && gallery.id !== "none",
			) ?? resolveGallery(this.galleries, this.selector)
		);
	}
	get gallery() {
		return this.galleryDefinition?.id ?? "missing";
	}
	get formerTeams() {
		return new Map(
			this.galleries
				.filter((gallery) => gallery.section === "team")
				.map(({ id, name }) => [id, name]),
		);
	}
	topicsFor(item: LearningItem) {
		return itemTopics(item, this.formerTeams.get(itemGallery(item)));
	}
	get listedItems() {
		return this.items.filter((item) => {
			const gallery = itemGallery(item);
			return (
				gallery === this.gallery ||
				(this.gallery === "public" && this.formerTeams.has(gallery))
			);
		});
	}
	get viewableItems() {
		// Preserve direct links to team and link-only content from the public root.
		return this.gallery === "public"
			? this.items.filter(
					(item) => itemGallery(item) !== "study" || this.formerTeams.has("study"),
				)
			: this.listedItems;
	}
	get topics() {
		const topics = new Map<string, string>();
		for (const item of this.listedItems) {
			for (const topic of this.topicsFor(item)) {
				const key = topic.toLocaleLowerCase("he");
				if (!topics.has(key)) topics.set(key, topic);
			}
		}
		return [...topics.values()].sort((a, b) => a.localeCompare(b, "he"));
	}
	get featured() {
		return this.listedItems.find((item) => item.featured) ?? this.listedItems[0];
	}
	get videoCount() {
		return this.listedItems.filter((item) => item.video).length;
	}
	get deckCount() {
		return this.listedItems.filter((item) => item.deck).length;
	}
	get visibleItems() {
		const words = this.query.trim().toLocaleLowerCase("he").split(/\s+/).filter(Boolean);
		return this.listedItems.filter((item) => {
			const topics = this.topicsFor(item).map((topic) => topic.toLocaleLowerCase("he"));
			const text = [item.title, item.description, ...topics, ...item.chapters]
				.join(" ")
				.toLocaleLowerCase("he");
			return (
				words.every((word) => text.includes(word)) &&
				(this.topic === null || topics.includes(this.topic)) &&
				(this.filter === "all" || Boolean(item[this.filter]))
			);
		});
	}
	setQuery(value: string) {
		this.query = value;
	}
	setFilter(value: MediaFilter) {
		this.filter = value;
	}
	setTopic(value: string | null) {
		this.topic = value?.toLocaleLowerCase("he") ?? null;
	}
	reset() {
		this.query = "";
		this.filter = "all";
		this.topic = null;
	}
	async load() {
		const generation = ++this.generation;
		this.loading = true;
		this.error = null;
		try {
			const catalog = await this.repository.list();
			if (generation !== this.generation) return;
			runInAction(() => {
				this.items = catalog.items;
				this.galleries = catalog.galleries;
				if (!this.galleryDefinition)
					this.error = "הספרייה לא נמצאה. ייתכן שהקישור השתנה או שהספרייה נמחקה.";
				this.loading = false;
			});
		} catch {
			if (generation !== this.generation) return;
			runInAction(() => {
				this.error = "לא הצלחנו לטעון את הספרייה. אפשר לנסות שוב.";
				this.loading = false;
			});
		}
	}
	dispose() {
		this.generation++;
		this.repository.dispose();
	}
}
