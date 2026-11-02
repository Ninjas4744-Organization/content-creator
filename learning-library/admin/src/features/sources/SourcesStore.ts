import { makeAutoObservable, observable, runInAction } from "mobx";
import type { CatalogRevision } from "../../models/catalog";
import type {
	PhotoAlbum,
	SourcesRepository,
	SourceSnapshot,
	SourceHistoryEntry,
	SourceMutation,
	ContentBackground,
	BackgroundAsset,
} from "../../models/sources";

export class SourcesStore {
	albums: PhotoAlbum[] = [];
	backgrounds: ContentBackground[] = [];
	history: SourceHistoryEntry[] = [];
	revision: CatalogRevision = 0;
	updatedAt: string | null = null;
	query = "";
	loading = true;
	saving = false;
	uploading = false;
	error: string | null = null;
	message: string | null = null;
	private generation = 0;
	private disposed = false;
	constructor(private readonly repository: SourcesRepository) {
		makeAutoObservable<this, "repository" | "generation" | "disposed">(
			this,
			{
				repository: false,
				generation: false,
				disposed: false,
				albums: observable.ref,
				backgrounds: observable.ref,
				history: observable.ref,
			},
			{ autoBind: true },
		);
	}
	get visibleAlbums() {
		const words = this.query.trim().toLocaleLowerCase("he").split(/\s+/).filter(Boolean);
		return this.albums.filter((album) =>
			words.every((word) =>
				[album.title, album.id, album.context, ...album.tags]
					.join(" ")
					.toLocaleLowerCase("he")
					.includes(word),
			),
		);
	}
	setQuery(query: string) {
		this.query = query;
	}
	get visibleBackgrounds() {
		const words = this.query.trim().toLocaleLowerCase("he").split(/\s+/).filter(Boolean);
		return this.backgrounds.filter((background) =>
			words.every((word) =>
				`${background.name} ${background.description}`
					.toLocaleLowerCase("he")
					.includes(word),
			),
		);
	}
	async uploadBackground(data: ArrayBuffer, type: string): Promise<BackgroundAsset | null> {
		if (this.saving || this.uploading || this.disposed) return null;
		this.uploading = true;
		this.error = null;
		try {
			const asset = await this.repository.uploadBackground(data, type);
			return this.disposed ? null : asset;
		} catch (error) {
			if (!this.disposed)
				runInAction(() => {
					this.error = error instanceof Error ? error.message : "העלאת הרקע לא הושלמה.";
				});
			return null;
		} finally {
			if (!this.disposed)
				runInAction(() => {
					this.uploading = false;
				});
		}
	}
	clearFeedback() {
		this.error = null;
		this.message = null;
	}
	setError(error: string) {
		this.error = error;
	}
	private accept(snapshot: SourceSnapshot) {
		this.albums = snapshot.albums;
		this.backgrounds = snapshot.backgrounds;
		this.revision = snapshot.revision;
		this.updatedAt = snapshot.updatedAt;
	}
	async load() {
		if (this.saving) return;
		const generation = ++this.generation;
		this.disposed = false;
		this.loading = true;
		this.error = null;
		this.message = null;
		try {
			const [snapshot, history] = await Promise.all([
				this.repository.load(),
				this.repository.history(),
			]);
			if (this.disposed || generation !== this.generation) return;
			runInAction(() => {
				this.accept(snapshot);
				this.history = history;
			});
		} catch (error) {
			if (!this.disposed && generation === this.generation)
				runInAction(() => {
					this.error =
						error instanceof Error ? error.message : "טעינת המקורות לא הושלמה.";
				});
		} finally {
			if (!this.disposed && generation === this.generation)
				runInAction(() => {
					this.loading = false;
				});
		}
	}
	async change(input: SourceMutation): Promise<boolean> {
		if (this.loading || this.saving || this.uploading || this.disposed) return false;
		this.saving = true;
		this.error = null;
		this.message = null;
		try {
			const snapshot = await this.repository.change(input, this.revision);
			if (this.disposed) return false;
			runInAction(() => {
				this.accept(snapshot);
				this.message = "המקורות נשמרו";
			});
			// A failed history refresh must not turn a successful save into a retry.
			try {
				const history = await this.repository.history();
				if (!this.disposed)
					runInAction(() => {
						this.history = history;
					});
			} catch {
				/* The next explicit reload refreshes history. */
			}
			return true;
		} catch (error) {
			if (!this.disposed)
				runInAction(() => {
					this.error =
						error instanceof Error ? error.message : "שמירת המקורות לא הושלמה.";
				});
			return false;
		} finally {
			if (!this.disposed)
				runInAction(() => {
					this.saving = false;
				});
		}
	}
	dispose() {
		this.disposed = true;
		this.generation++;
		this.repository.dispose();
	}
}
