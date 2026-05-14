export function nowUtcIso(): string {
	return new Date().toISOString();
}

export function localTzName(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const dayKeyFmt = new Map<string, Intl.DateTimeFormat>();
function dayFormatter(tz: string): Intl.DateTimeFormat {
	let f = dayKeyFmt.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
		dayKeyFmt.set(tz, f);
	}
	return f;
}

export function localDayKey(utcIso: string, tz: string = localTzName()): string {
	return dayFormatter(tz).format(new Date(utcIso));
}

const partsFmt = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
	let f = partsFmt.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
		partsFmt.set(tz, f);
	}
	return f;
}

function getOffsetMs(date: Date, tz: string): number {
	const parts = partsFormatter(tz).formatToParts(date);
	const map: Record<string, string> = {};
	for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
	const asUtc = Date.UTC(
		Number(map.year),
		Number(map.month) - 1,
		Number(map.day),
		Number(map.hour) === 24 ? 0 : Number(map.hour),
		Number(map.minute),
		Number(map.second)
	);
	return asUtc - date.getTime();
}

export function localEndOfDayUtc(utcIso: string, tz: string = localTzName()): string {
	const ref = new Date(utcIso);
	const offset = getOffsetMs(ref, tz);
	const localMs = ref.getTime() + offset;
	const local = new Date(localMs);
	const eodLocalMs = Date.UTC(
		local.getUTCFullYear(),
		local.getUTCMonth(),
		local.getUTCDate(),
		23,
		59,
		59,
		999
	);
	const eodCandidate = new Date(eodLocalMs - offset);
	const offsetAtEod = getOffsetMs(eodCandidate, tz);
	if (offsetAtEod !== offset) {
		return new Date(eodLocalMs - offsetAtEod).toISOString();
	}
	return eodCandidate.toISOString();
}

export function formatDuration(ms: number): string {
	if (ms < 0) ms = 0;
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatHoursShort(ms: number): string {
	const hours = ms / 3_600_000;
	if (hours >= 1) return `${hours.toFixed(1)}h`;
	const minutes = Math.round(ms / 60_000);
	return `${minutes}m`;
}

export function formatTimeOfDay(utcIso: string, tz: string = localTzName()): string {
	return new Intl.DateTimeFormat([], {
		timeZone: tz,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(new Date(utcIso));
}

export function dateToKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDayLabel(dayKey: string, tz: string = localTzName()): string {
	const today = localDayKey(new Date().toISOString(), tz);
	if (dayKey === today) return 'Today';
	const d = new Date();
	d.setDate(d.getDate() - 1);
	if (dayKey === localDayKey(d.toISOString(), tz)) return 'Yesterday';
	return new Intl.DateTimeFormat([], { weekday: 'long', month: 'short', day: 'numeric' })
		.format(new Date(dayKey + 'T12:00:00'));
}
