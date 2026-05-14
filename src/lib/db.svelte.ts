import Database from '@tauri-apps/plugin-sql';
import { runMigrations } from './migrations';
import { localTzName, nowUtcIso } from './time';

export type Entry = {
	id: number;
	started_at: string;
	stopped_at: string | null;
	recorded_tz: string;
	source: 'live' | 'manual';
	note: string | null;
};

export type Pause = {
	id: number;
	entry_id: number;
	started_at: string;
	stopped_at: string | null;
};

export type Vacation = {
	id: number;
	start_date: string;
	end_date: string;
	exclude_weekends: number;
	note: string | null;
};

export type DayNote = {
	id: number;
	day_key: string;
	body: string;
	created_at: string;
};

let _db: Database | null = null;
let _path: string | null = null;

export function isOpen(): boolean {
	return _db !== null;
}

export function currentPath(): string | null {
	return _path;
}

export async function open(path: string): Promise<Database> {
	if (_db && _path === path) return _db;
	if (_db) await close();
	const db = await Database.load(`sqlite:${path}`);
	await runMigrations(db);
	_db = db;
	_path = path;
	return db;
}

export async function close(): Promise<void> {
	if (!_db) return;
	await _db.close();
	_db = null;
	_path = null;
}

function require_(): Database {
	if (!_db) throw new Error('Database not opened');
	return _db;
}

export async function getOpenEntry(): Promise<Entry | null> {
	const db = require_();
	const rows = await db.select<Entry[]>(
		'SELECT * FROM entries WHERE stopped_at IS NULL ORDER BY id DESC LIMIT 1'
	);
	return rows[0] ?? null;
}

export async function getAllOpenEntries(): Promise<Entry[]> {
	const db = require_();
	return db.select<Entry[]>(
		'SELECT * FROM entries WHERE stopped_at IS NULL ORDER BY id DESC'
	);
}

export async function getEntries(rangeStartUtc: string, rangeEndUtc: string): Promise<Entry[]> {
	const db = require_();
	return db.select<Entry[]>(
		`SELECT * FROM entries
			WHERE started_at >= $1 AND started_at < $2
			ORDER BY started_at DESC`,
		[rangeStartUtc, rangeEndUtc]
	);
}

export async function getRecentEntries(limit: number): Promise<Entry[]> {
	const db = require_();
	return db.select<Entry[]>(
		`SELECT * FROM entries ORDER BY started_at DESC LIMIT $1`,
		[limit]
	);
}

export async function getMostRecentStoppedEntry(): Promise<Entry | null> {
	const db = require_();
	const rows = await db.select<Entry[]>(
		'SELECT * FROM entries WHERE stopped_at IS NOT NULL ORDER BY stopped_at DESC LIMIT 1'
	);
	return rows[0] ?? null;
}

export async function mergeAdjacentEntries(gapMs: number = 2 * 60_000): Promise<number> {
	const db_ = require_();
	const entries = await db_.select<Entry[]>(
		'SELECT * FROM entries ORDER BY started_at ASC'
	);
	let merged = 0;
	for (let i = 0; i < entries.length - 1; i++) {
		const curr = entries[i];
		const next = entries[i + 1];
		if (!curr.stopped_at) continue;
		const gap = new Date(next.started_at).getTime() - new Date(curr.stopped_at).getTime();
		if (gap >= 0 && gap <= gapMs) {
			// Extend current entry to cover next (or reopen if next is running), move pauses, delete next
			await db_.execute(
				`UPDATE entries SET stopped_at = $1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = $2`,
				[next.stopped_at, curr.id]
			);
			await db_.execute(
				`UPDATE pauses SET entry_id = $1 WHERE entry_id = $2`,
				[curr.id, next.id]
			);
			await db_.execute('DELETE FROM entries WHERE id = $1', [next.id]);
			curr.stopped_at = next.stopped_at;
			entries.splice(i + 1, 1);
			i--;
			merged++;
		}
	}
	return merged;
}

export async function reopenEntry(id: number): Promise<void> {
	const db = require_();
	await db.execute(
		`UPDATE entries SET stopped_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = $1`,
		[id]
	);
}

export async function insertLiveEntry(startedAt: string = nowUtcIso()): Promise<Entry> {
	const db = require_();
	const tz = localTzName();
	const result = await db.execute(
		`INSERT INTO entries (started_at, recorded_tz, source) VALUES ($1, $2, 'live')`,
		[startedAt, tz]
	);
	const id = result.lastInsertId ?? 0;
	const rows = await db.select<Entry[]>('SELECT * FROM entries WHERE id = $1', [id]);
	return rows[0]!;
}

export async function insertManualEntry(
	startedAt: string,
	stoppedAt: string,
	note: string | null
): Promise<Entry> {
	const db = require_();
	const tz = localTzName();
	const result = await db.execute(
		`INSERT INTO entries (started_at, stopped_at, recorded_tz, source, note)
			VALUES ($1, $2, $3, 'manual', $4)`,
		[startedAt, stoppedAt, tz, note]
	);
	const id = result.lastInsertId ?? 0;
	const rows = await db.select<Entry[]>('SELECT * FROM entries WHERE id = $1', [id]);
	return rows[0]!;
}

export async function deleteEntry(id: number): Promise<void> {
	const db = require_();
	await db.execute('DELETE FROM entries WHERE id = $1', [id]);
}

export async function updateEntryTimes(id: number, startedAt: string, stoppedAt: string): Promise<void> {
	const db = require_();
	await db.execute(
		`UPDATE entries
			SET started_at = $1, stopped_at = $2,
			    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
			WHERE id = $3`,
		[startedAt, stoppedAt, id]
	);
	// Delete pauses fully outside the new range
	await db.execute(
		`DELETE FROM pauses WHERE entry_id = $1 AND (started_at >= $2 OR stopped_at <= $3)`,
		[id, stoppedAt, startedAt]
	);
	// Trim pauses that partially overlap the new boundaries
	await db.execute(
		`UPDATE pauses SET started_at = $1 WHERE entry_id = $2 AND started_at < $1`,
		[startedAt, id]
	);
	await db.execute(
		`UPDATE pauses SET stopped_at = $1 WHERE entry_id = $2 AND stopped_at > $1`,
		[stoppedAt, id]
	);
}

export async function stopEntry(id: number, stoppedAtUtc: string): Promise<void> {
	const db = require_();
	await db.execute(
		`UPDATE entries
			SET stopped_at = $1,
			    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
			WHERE id = $2`,
		[stoppedAtUtc, id]
	);
}

export async function getPausesForEntry(entryId: number): Promise<Pause[]> {
	const db = require_();
	return db.select<Pause[]>(
		'SELECT * FROM pauses WHERE entry_id = $1 ORDER BY started_at ASC',
		[entryId]
	);
}

export async function startPause(entryId: number, atUtc: string = nowUtcIso()): Promise<Pause> {
	const db = require_();
	const result = await db.execute(
		'INSERT INTO pauses (entry_id, started_at) VALUES ($1, $2)',
		[entryId, atUtc]
	);
	const id = result.lastInsertId ?? 0;
	const rows = await db.select<Pause[]>('SELECT * FROM pauses WHERE id = $1', [id]);
	return rows[0]!;
}

export async function stopPause(pauseId: number, atUtc: string = nowUtcIso()): Promise<void> {
	const db = require_();
	await db.execute('UPDATE pauses SET stopped_at = $1 WHERE id = $2', [atUtc, pauseId]);
}

export async function getOpenPause(entryId: number): Promise<Pause | null> {
	const db = require_();
	const rows = await db.select<Pause[]>(
		'SELECT * FROM pauses WHERE entry_id = $1 AND stopped_at IS NULL LIMIT 1',
		[entryId]
	);
	return rows[0] ?? null;
}

export async function getPauseTotalsByEntries(entryIds: number[]): Promise<Map<number, number>> {
	if (entryIds.length === 0) return new Map();
	const db = require_();
	const placeholders = entryIds.map((_, i) => `$${i + 1}`).join(',');
	const rows = await db.select<{ entry_id: number; total_ms: number }[]>(
		`SELECT entry_id,
			SUM(
				(julianday(COALESCE(stopped_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))) - julianday(started_at)) * 86400000
			) AS total_ms
		FROM pauses
		WHERE entry_id IN (${placeholders})
		GROUP BY entry_id`,
		entryIds
	);
	const map = new Map<number, number>();
	for (const r of rows) map.set(r.entry_id, Math.round(r.total_ms));
	return map;
}

export async function getPauseTotalsByDay(tz: string): Promise<Map<string, number>> {
	const db_ = require_();
	const rows = await db_.select<{ entry_id: number; started_at: string; total_pause_ms: number }[]>(
		`SELECT p.entry_id, e.started_at,
			SUM(
				(julianday(COALESCE(p.stopped_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))) - julianday(p.started_at)) * 86400000
			) AS total_pause_ms
		FROM pauses p
		JOIN entries e ON e.id = p.entry_id
		GROUP BY p.entry_id`
	);
	const { localDayKey } = await import('./time');
	const map = new Map<string, number>();
	for (const r of rows) {
		const day = localDayKey(r.started_at, tz);
		map.set(day, (map.get(day) ?? 0) + Math.round(r.total_pause_ms));
	}
	return map;
}

export async function getVacations(): Promise<Vacation[]> {
	const db = require_();
	return db.select<Vacation[]>('SELECT * FROM vacations ORDER BY start_date DESC');
}

export async function insertVacation(
	startDate: string,
	endDate: string,
	excludeWeekends: boolean,
	note: string | null
): Promise<Vacation> {
	const db = require_();
	const result = await db.execute(
		`INSERT INTO vacations (start_date, end_date, exclude_weekends, note)
			VALUES ($1, $2, $3, $4)`,
		[startDate, endDate, excludeWeekends ? 1 : 0, note]
	);
	const id = result.lastInsertId ?? 0;
	const rows = await db.select<Vacation[]>('SELECT * FROM vacations WHERE id = $1', [id]);
	return rows[0]!;
}

export async function deleteVacation(id: number): Promise<void> {
	const db = require_();
	await db.execute('DELETE FROM vacations WHERE id = $1', [id]);
}

export async function getNotesForDay(dayKey: string): Promise<DayNote[]> {
	const db = require_();
	return db.select<DayNote[]>(
		'SELECT * FROM day_notes WHERE day_key = $1 ORDER BY created_at ASC',
		[dayKey]
	);
}

export async function getNoteCountsByDay(): Promise<Map<string, number>> {
	const db = require_();
	const rows = await db.select<{ day_key: string; cnt: number }[]>(
		'SELECT day_key, COUNT(*) as cnt FROM day_notes GROUP BY day_key'
	);
	const map = new Map<string, number>();
	for (const r of rows) map.set(r.day_key, r.cnt);
	return map;
}

export async function insertDayNote(dayKey: string, body: string): Promise<DayNote> {
	const db = require_();
	const result = await db.execute(
		'INSERT INTO day_notes (day_key, body) VALUES ($1, $2)',
		[dayKey, body]
	);
	const id = result.lastInsertId ?? 0;
	const rows = await db.select<DayNote[]>('SELECT * FROM day_notes WHERE id = $1', [id]);
	return rows[0]!;
}

export async function updateDayNoteBody(id: number, body: string): Promise<void> {
	const db = require_();
	await db.execute('UPDATE day_notes SET body = $1 WHERE id = $2', [body, id]);
}

export async function updateDayNoteTime(id: number, createdAt: string): Promise<void> {
	const db = require_();
	await db.execute('UPDATE day_notes SET created_at = $1 WHERE id = $2', [createdAt, id]);
}

export async function deleteDayNote(id: number): Promise<void> {
	const db = require_();
	await db.execute('DELETE FROM day_notes WHERE id = $1', [id]);
}
