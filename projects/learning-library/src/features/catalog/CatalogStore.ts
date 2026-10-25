import { makeAutoObservable, observable, runInAction } from "mobx";
import type { CatalogRepository, LearningItem, MediaFilter } from "../../models/catalog";

export class CatalogStore {
	items: LearningItem[] = [];
	query = "";
	filter: MediaFilter = "all";
	category = "הכול";
	loading = true;
	error: string | null = null;
	private generation = 0;

	constructor(private readonly repository: CatalogRepository) {
		makeAutoObservable<this, "repository" | "generation">(
			this,
			{ repository: false, generation: false, items: observable.ref },
			{ autoBind: true },
		);
	}

	get categories() {
		return ["הכול", ...new Set(this.items.map((item) => item.category))];
	}
	get featured() {
		return this.items.find((item) => item.featured) ?? this.items[0];
	}
	get videoCount() {
		return this.items.filter((item) => item.video).length;
	}
	get deckCount() {
		return this.items.filter((item) => item.deck).length;
	}
	get visibleItems() {
		const words = this.query.trim().toLocaleLowerCase("he").split(/\s+/).filter(Boolean);
		return this.items.filter((item) => {
			const text = [item.title, item.description, item.category, ...item.chapters]
				.join(" ")
				.toLocaleLowerCase("he");
			return (
				words.every((word) => text.includes(word)) &&
				(this.filter === "all" || Boolean(item[this.filter])) &&
				(this.category === "הכול" || this.category === item.category)
			);
		});
	}
	setQuery(value: string) {
		this.query = value;
	}
	setFilter(value: MediaFilter) {
		this.filter = value;
	}
	setCategory(value: string) {
		this.category = value;
	}
	reset() {
		this.query = "";
		this.filter = "all";
		this.category = "הכול";
	}
	async load() {
		const generation = ++this.generation;
		this.loading = true;
		this.error = null;
		try {
			const items = await this.repository.list();
			if (generation !== this.generation) return;
			runInAction(() => {
				this.items = items;
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
