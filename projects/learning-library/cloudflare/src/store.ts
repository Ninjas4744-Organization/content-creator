import { ConflictError, InputError, now } from "./model";

interface Row {
	data: string;
	revision: number;
}

export class Store {
	constructor(private readonly db: D1Database) {}

	async put(kind: string, id: string, data: unknown, ttl: number): Promise<void> {
		await this.db
			.prepare("INSERT INTO lti_records(kind,id,data,expires) VALUES(?,?,?,?)")
			.bind(kind, id, JSON.stringify(data), now() + ttl)
			.run();
	}
	async get<T>(kind: string, id: string): Promise<T> {
		const row = await this.db
			.prepare("SELECT data FROM lti_records WHERE kind=? AND id=? AND expires>?")
			.bind(kind, id, now())
			.first<{ data: string }>();
		if (!row) throw new InputError("Expired session");
		return JSON.parse(row.data) as T;
	}
	async take<T>(kind: string, id: string): Promise<T> {
		const row = await this.db
			.prepare("DELETE FROM lti_records WHERE kind=? AND id=? AND expires>? RETURNING data")
			.bind(kind, id, now())
			.first<{ data: string }>();
		if (!row) throw new InputError("Expired or consumed session");
		return JSON.parse(row.data) as T;
	}
	async ensure<T>(id: string, data: T, ttl: number): Promise<T> {
		await this.db
			.prepare(
				"INSERT INTO lti_records(kind,id,data,expires) VALUES('attempt',?,?,?) " +
					"ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,expires=excluded.expires,revision=revision+1 WHERE lti_records.expires<?",
			)
			.bind(id, JSON.stringify(data), now() + ttl, now())
			.run();
		return this.get<T>("attempt", id);
	}
	async change<T>(kind: string, id: string, update: (value: T) => void): Promise<T> {
		// Optimistic concurrency keeps edits atomic across isolates; no process-local locks.
		for (let tries = 0; tries < 5; tries++) {
			const row = await this.db
				.prepare(
					"SELECT data,revision FROM lti_records WHERE kind=? AND id=? AND expires>?",
				)
				.bind(kind, id, now())
				.first<Row>();
			if (!row) throw new InputError("Expired session");
			const value = JSON.parse(row.data) as T;
			update(value);
			const result = await this.db
				.prepare(
					"UPDATE lti_records SET data=?,revision=revision+1 WHERE kind=? AND id=? AND revision=? AND expires>?",
				)
				.bind(JSON.stringify(value), kind, id, row.revision, now())
				.run();
			if (result.meta.changes === 1) return value;
		}
		throw new ConflictError("Please retry");
	}
	async prune(): Promise<void> {
		await this.db
			.prepare(
				"DELETE FROM lti_records WHERE rowid IN (SELECT rowid FROM lti_records WHERE expires<? LIMIT 1000)",
			)
			.bind(now())
			.run();
	}
}
