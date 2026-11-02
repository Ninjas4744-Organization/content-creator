import { makeAutoObservable, observable, runInAction } from "mobx";
import { isFixedGallery, itemGallery } from "../../models/catalog";
import { viewNames } from "./galleries";
import type {
	AdminView,
	CatalogRepository,
	CatalogInput,
	ImportMode,
	CatalogSnapshot,
	CatalogRevision,
	CatalogSort,
	Gallery,
	GalleryDefinition,
	GalleryMutation,
	HistoryEntry,
	LearningItem,
	MediaFilter,
} from "../../models/catalog";

export class CatalogStore {
	items: LearningItem[] = [];
	galleries: GalleryDefinition[] = [];
	revision: CatalogRevision = 0;
	mode: "local" | "production" = "local";
	updatedAt: string | null = null;
	query = "";
	filter: MediaFilter = "all";
	category = "הכול";
	gallery: "all" | Gallery = "all";
	view: AdminView = "all";
	sort: CatalogSort = "original";
	layout: "table" | "grid" = "table";
	selected: string[] = [];
	loading = true;
	saving = false;
	error: string | null = null;
	message: string | null = null;
	history: HistoryEntry[] = [];
	historyLoading = false;
	private generation = 0;
	private historyGeneration = 0;
	private disposed = false;

	constructor(private readonly repository: CatalogRepository) {
		makeAutoObservable<this, "repository" | "generation" | "historyGeneration" | "disposed">(
			this,
			{
				repository: false,
				generation: false,
				historyGeneration: false,
				disposed: false,
				items: observable.ref,
				galleries: observable.ref,
				history: observable.ref,
				selected: observable.ref,
			},
			{ autoBind: true },
		);
	}
	get production() {
		return this.mode === "production";
	}
	get workspaceLabel() {
		return this.production ? "מחובר לספרייה שבאתר" : "סביבת עבודה מקומית";
	}
	get savedMessage() {
		return this.production ? "השינויים נשמרו בספרייה שבאתר" : "השינויים נשמרו במרחב המקומי";
	}
	galleryName(id: Gallery): string {
		return this.galleries.find((gallery) => gallery.id === id)?.name ?? id;
	}
	get viewName() {
		return Object.hasOwn(viewNames, this.view)
			? viewNames[this.view]!
			: this.galleryName(this.view);
	}
	get categories() {
		return ["הכול", ...new Set(this.items.map((item) => item.category))].sort((a, b) =>
			a === "הכול" ? -1 : b === "הכול" ? 1 : a.localeCompare(b, "he"),
		);
	}
	get deckCount() {
		return this.items.filter((item) => item.deck).length;
	}
	get videoCount() {
		return this.items.filter((item) => item.video).length;
	}
	get featuredCount() {
		return this.items.filter((item) => item.featured).length;
	}
	get visibleItems() {
		const words = this.query.trim().toLocaleLowerCase("he").split(/\s+/).filter(Boolean);
		const items = this.items.filter((item) => {
			const gallery = itemGallery(item);
			const text = [item.title, item.description, item.category, item.id, ...item.chapters]
				.join(" ")
				.toLocaleLowerCase("he");
			return (
				(this.view === "all" ||
					this.view === "history" ||
					(this.view === "featured" ? item.featured : gallery === this.view)) &&
				(this.gallery === "all" || this.gallery === gallery) &&
				(this.filter === "all" || Boolean(item[this.filter])) &&
				(this.category === "הכול" || item.category === this.category) &&
				words.every((word) => text.includes(word))
			);
		});
		if (this.sort === "title") items.sort((a, b) => a.title.localeCompare(b.title, "he"));
		if (this.sort === "featured") items.sort((a, b) => Number(b.featured) - Number(a.featured));
		return items;
	}
	get allVisibleSelected() {
		return (
			this.visibleItems.length > 0 &&
			this.visibleItems.every((item) => this.selected.includes(item.id))
		);
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
	setGallery(value: "all" | Gallery) {
		this.gallery = value;
		this.clearSelection();
	}
	setSort(value: CatalogSort) {
		this.sort = value;
	}
	setLayout(value: "table" | "grid") {
		this.layout = value;
	}
	setView(value: AdminView) {
		this.view = value;
		this.gallery = "all";
		this.clearSelection();
		if (value === "history") void this.loadHistory();
	}
	setError(error: string | null) {
		this.error = error;
	}
	notify(message: string | null) {
		this.message = message;
	}
	toggleSelection(id: string) {
		this.selected = this.selected.includes(id)
			? this.selected.filter((entry) => entry !== id)
			: [...this.selected, id];
	}
	clearSelection() {
		this.selected = [];
	}
	toggleAllVisible() {
		const ids = this.visibleItems.map((item) => item.id);
		this.selected = this.allVisibleSelected
			? this.selected.filter((id) => !ids.includes(id))
			: [...new Set([...this.selected, ...ids])];
	}
	reset() {
		this.query = "";
		this.filter = "all";
		this.category = "הכול";
		this.gallery = "all";
		this.view = "all";
		this.clearSelection();
	}
	private accept(snapshot: CatalogSnapshot) {
		this.mode = snapshot.mode ?? "local";
		this.items = snapshot.items;
		this.galleries = snapshot.galleries;
		if (this.gallery !== "all" && !this.galleries.some((entry) => entry.id === this.gallery))
			this.gallery = "all";
		if (
			!Object.hasOwn(viewNames, this.view) &&
			!this.galleries.some((entry) => entry.id === this.view)
		)
			this.view = "all";
		this.revision = snapshot.revision;
		this.updatedAt = snapshot.updatedAt;
		if (!this.categories.includes(this.category)) this.category = "הכול";
		this.clearSelection();
	}
	async load() {
		const generation = ++this.generation;
		this.disposed = false;
		this.loading = true;
		this.error = null;
		try {
			const snapshot = await this.repository.load();
			if (generation !== this.generation || this.disposed) return;
			runInAction(() => {
				this.accept(snapshot);
				this.loading = false;
			});
		} catch (error) {
			if (generation !== this.generation || this.disposed) return;
			runInAction(() => {
				this.error = error instanceof Error ? error.message : "לא הצלחנו לטעון את הקטלוג.";
				this.loading = false;
			});
		}
	}
	private async persist(
		operation: () => Promise<CatalogSnapshot>,
		message: string,
	): Promise<boolean> {
		if (this.saving) return false;
		this.saving = true;
		this.error = null;
		try {
			const snapshot = await operation();
			if (this.disposed) return false;
			runInAction(() => {
				this.accept(snapshot);
				this.message = message;
			});
			return true;
		} catch (error) {
			if (!this.disposed)
				runInAction(() => {
					this.error = error instanceof Error ? error.message : "השמירה לא הושלמה.";
				});
			return false;
		} finally {
			if (!this.disposed)
				runInAction(() => {
					this.saving = false;
				});
		}
	}
	private save(items: LearningItem[], action: string) {
		return this.persist(
			() => this.repository.save(items, this.revision, action),
			this.savedMessage,
		);
	}
	saveItem(item: LearningItem, originalId?: string) {
		if (!originalId && this.items.some((existing) => existing.id === item.id)) {
			this.error = "מזהה התוכן כבר קיים. בחרו מזהה אחר.";
			return Promise.resolve(false);
		}
		const items = originalId
			? this.items.map((existing) => (existing.id === originalId ? item : existing))
			: [...this.items, item];
		return this.save(items, `${originalId ? "עריכת" : "הוספת"} תוכן: ${item.title}`);
	}
	removeItem(id: string) {
		return this.save(
			this.items.filter((item) => item.id !== id),
			"הסרת תוכן מהקטלוג",
		);
	}
	toggleFeatured(id: string) {
		return this.save(
			this.items.map((item) =>
				item.id === id ? { ...item, featured: !item.featured } : item,
			),
			"עדכון תוכן מומלץ",
		);
	}
	moveSelected(gallery: Gallery) {
		return this.save(
			this.items.map((item) =>
				this.selected.includes(item.id)
					? { ...item, gallery, unlisted: gallery !== "public" }
					: item,
			),
			`שינוי ספרייה עבור ${this.selected.length} תכנים`,
		);
	}
	changeGallery(change: GalleryMutation) {
		if (change.type !== "create" && isFixedGallery(change.id)) {
			this.error = "אי אפשר לשנות או למחוק ספרייה קבועה.";
			return Promise.resolve(false);
		}
		return this.persist(
			() => this.repository.changeGallery(change, this.revision),
			change.type === "delete"
				? "הספרייה נמחקה והתכנים שלה הועברו לבקישור בלבד"
				: this.savedMessage,
		);
	}
	importCatalog(catalog: CatalogInput, mode: ImportMode) {
		return this.persist(
			() => this.repository.importCatalog(catalog, mode, this.revision),
			this.savedMessage,
		);
	}
	importItems(items: LearningItem[], overwrite: boolean) {
		return this.importCatalog(items, overwrite ? "overwrite" : "merge");
	}
	readSource() {
		return this.repository.source();
	}
	async loadHistory() {
		const generation = ++this.historyGeneration;
		this.historyLoading = true;
		try {
			const history = await this.repository.history();
			if (generation !== this.historyGeneration || this.disposed) return;
			runInAction(() => {
				this.history = history;
			});
		} catch (error) {
			if (!this.disposed)
				runInAction(() => {
					this.error =
						error instanceof Error ? error.message : "לא הצלחנו לטעון את ההיסטוריה.";
				});
		} finally {
			if (generation === this.historyGeneration && !this.disposed)
				runInAction(() => {
					this.historyLoading = false;
				});
		}
	}
	async restore(id: string) {
		const restored = await this.persist(
			() => this.repository.restore(id, this.revision),
			this.production ? "הגרסה שוחזרה בספרייה שבאתר" : "הגרסה שוחזרה במרחב המקומי",
		);
		if (restored) await this.loadHistory();
		return restored;
	}
	dispose() {
		this.disposed = true;
		this.generation++;
		this.historyGeneration++;
		this.repository.dispose();
	}
}
