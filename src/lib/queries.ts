import * as db from './db.svelte';
import type { Entry, Vacation } from './db.svelte';
import { localDayKey, localTzName, dateToKey } from './time';

export async function dailyTotalsForRange(
	startUtc: string,
	endUtc: string,
	tz: string = localTzName()
): Promise<Map<string, number>> {
	const entries = await db.getEntries(startUtc, endUtc);
	return entriesToDailyTotals(entries, tz);
}

export function entriesToDailyTotals(
	entries: Entry[],
	tz: string = localTzName(),
	pauseTotals?: Map<number, number>
): Map<string, number> {
	const totals = new Map<string, number>();
	for (const e of entries) {
		const key = localDayKey(e.started_at, tz);
		const start = new Date(e.started_at).getTime();
		const end = e.stopped_at ? new Date(e.stopped_at).getTime() : Date.now();
		const rawMs = Math.max(0, end - start);
		const pMs = pauseTotals ? Math.min(pauseTotals.get(e.id) ?? 0, rawMs) : 0;
		totals.set(key, (totals.get(key) ?? 0) + rawMs - pMs);
	}
	return totals;
}

export function vacationDaySet(vacations: Vacation[]): Set<string> {
	const days = new Set<string>();
	for (const v of vacations) {
		const start = new Date(v.start_date + 'T00:00:00');
		const end = new Date(v.end_date + 'T00:00:00');
		for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
			const dow = d.getDay();
			if (v.exclude_weekends && (dow === 0 || dow === 6)) continue;
			days.add(dateToKey(d));
		}
	}
	return days;
}
