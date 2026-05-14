import type Database from '@tauri-apps/plugin-sql';

type Migration = {
	version: number;
	up: string;
};

const migrations: Migration[] = [
	{
		version: 1,
		up: `
			CREATE TABLE IF NOT EXISTS entries (
				id            INTEGER PRIMARY KEY AUTOINCREMENT,
				started_at    TEXT NOT NULL,
				stopped_at    TEXT,
				recorded_tz   TEXT NOT NULL,
				source        TEXT NOT NULL CHECK (source IN ('live','manual')),
				note          TEXT,
				created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
				updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
				CHECK (stopped_at IS NULL OR stopped_at > started_at),
				CHECK (
					stopped_at IS NULL
					OR (julianday(stopped_at) - julianday(started_at)) * 86400 <= 86400
				)
			);
			CREATE UNIQUE INDEX IF NOT EXISTS entries_one_open
				ON entries(stopped_at) WHERE stopped_at IS NULL;
			CREATE INDEX IF NOT EXISTS entries_started_at ON entries(started_at);

			CREATE TABLE IF NOT EXISTS pauses (
				id            INTEGER PRIMARY KEY AUTOINCREMENT,
				entry_id      INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
				started_at    TEXT NOT NULL,
				stopped_at    TEXT,
				CHECK (stopped_at IS NULL OR stopped_at > started_at)
			);
			CREATE INDEX IF NOT EXISTS pauses_entry ON pauses(entry_id);

			CREATE TABLE IF NOT EXISTS schema_meta (
				key   TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
		`
	},
	{
		version: 2,
		up: `
			CREATE TABLE IF NOT EXISTS vacations (
				id                INTEGER PRIMARY KEY AUTOINCREMENT,
				start_date        TEXT NOT NULL,
				end_date          TEXT NOT NULL,
				exclude_weekends  INTEGER NOT NULL DEFAULT 1,
				note              TEXT,
				created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
				CHECK (end_date >= start_date)
			);
			CREATE INDEX IF NOT EXISTS vacations_range ON vacations(start_date, end_date);
		`
	},
	{
		version: 3,
		up: `
			CREATE TABLE IF NOT EXISTS day_notes (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				day_key     TEXT NOT NULL,
				body        TEXT NOT NULL,
				created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
			);
			CREATE INDEX IF NOT EXISTS day_notes_day ON day_notes(day_key);
		`
	},
	{
		version: 4,
		up: `
			-- Recreate entries table with relaxed CHECK (>= instead of >)
			CREATE TABLE entries_new (
				id            INTEGER PRIMARY KEY AUTOINCREMENT,
				started_at    TEXT NOT NULL,
				stopped_at    TEXT,
				recorded_tz   TEXT NOT NULL,
				source        TEXT NOT NULL CHECK (source IN ('live','manual')),
				note          TEXT,
				created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
				updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
				CHECK (stopped_at IS NULL OR stopped_at >= started_at),
				CHECK (
					stopped_at IS NULL
					OR (julianday(stopped_at) - julianday(started_at)) * 86400 <= 86400
				)
			);
			INSERT INTO entries_new SELECT * FROM entries;
			DROP TABLE entries;
			ALTER TABLE entries_new RENAME TO entries;
			CREATE INDEX entries_started_at ON entries(started_at);
		`
	},
	{
		version: 5,
		up: `
			DELETE FROM pauses WHERE id IN (
				SELECT p.id FROM pauses p
				JOIN entries e ON e.id = p.entry_id
				WHERE e.stopped_at IS NOT NULL
				AND (p.started_at >= e.stopped_at OR p.stopped_at <= e.started_at)
			);
			DELETE FROM pauses WHERE id IN (
				SELECT p.id FROM pauses p
				JOIN entries e ON e.id = p.entry_id
				WHERE e.stopped_at IS NOT NULL
				AND p.stopped_at > e.stopped_at
				AND p.started_at >= e.stopped_at
			);
			UPDATE pauses SET stopped_at = (
				SELECT e.stopped_at FROM entries e WHERE e.id = pauses.entry_id
			) WHERE id IN (
				SELECT p.id FROM pauses p
				JOIN entries e ON e.id = p.entry_id
				WHERE e.stopped_at IS NOT NULL
				AND p.stopped_at > e.stopped_at
				AND p.started_at < e.stopped_at
			);
		`
	}
];

export async function runMigrations(db: Database): Promise<void> {
	const rows = (await db.select<{ user_version: number }[]>('PRAGMA user_version')) ?? [];
	const current = rows[0]?.user_version ?? 0;
	for (const m of migrations) {
		if (m.version <= current) continue;
		await db.execute(m.up);
		await db.execute(`PRAGMA user_version = ${m.version}`);
	}
}

export const latestSchemaVersion = migrations[migrations.length - 1]!.version;
