import { invoke } from '@tauri-apps/api/core';
import * as db from './db.svelte';
import type { Entry, Pause } from './db.svelte';
import { nowUtcIso, localDayKey, localEndOfDayUtc, localTzName, formatDuration } from './time';
import { settings } from './settings.svelte';

export type PomodoroPhase = 'work' | 'short-break' | 'long-break';

type PomodoroState = {
	phase: PomodoroPhase;
	remainingMs: number;
	completedSessions: number;
};

type TrackerState = {
	active: Entry | null;
	pauses: Pause[];
	paused: boolean;
	tickNow: string;
	pomo: PomodoroState;
};

const state = $state<TrackerState>({
	active: null,
	pauses: [],
	paused: false,
	tickNow: nowUtcIso(),
	pomo: { phase: 'work', remainingMs: 0, completedSessions: 0 }
});

// Store interval IDs on globalThis so HMR module replacement can still clear them
const G = globalThis as unknown as Record<string, ReturnType<typeof setInterval> | null>;
function getInterval(key: string) { return G[`__wt_${key}`] ?? null; }
function setIntervalId(key: string, id: ReturnType<typeof setInterval> | null) { G[`__wt_${key}`] = id; }

function notify(title: string, body: string) {
	console.log('[pomo] sending notification:', title, body);
	invoke('send_notification', { title, body }).catch((e) => {
		console.error('[pomo] notification invoke failed:', e);
	});
}

function pomoPhaseMs(phase: PomodoroPhase): number {
	const p = settings.pomodoro;
	if (phase === 'work') return p.workMins * 60_000;
	if (phase === 'short-break') return p.shortBreakMins * 60_000;
	return p.longBreakMins * 60_000;
}

function resetPomo() {
	state.pomo = { phase: 'work', remainingMs: pomoPhaseMs('work'), completedSessions: 0 };
}

function pomoTick() {
	if (!settings.pomodoro.enabled || !state.active) return;
	// Work phase only ticks while not paused; break phase always ticks
	if (state.pomo.phase === 'work' && state.paused) return;

	state.pomo.remainingMs -= 1000;
	if (state.pomo.remainingMs <= 0) {
		pomoPhaseComplete();
	}
}

function pomoPhaseComplete() {
	console.log('[pomo] phase complete:', state.pomo.phase, 'sessions:', state.pomo.completedSessions);
	const p = settings.pomodoro;
	if (state.pomo.phase === 'work') {
		const sessions = state.pomo.completedSessions + 1;
		const isLong = sessions % p.sessionsBeforeLong === 0;
		const nextPhase: PomodoroPhase = isLong ? 'long-break' : 'short-break';
		state.pomo.completedSessions = sessions;
		state.pomo.phase = nextPhase;
		state.pomo.remainingMs = pomoPhaseMs(nextPhase);
		notify('Time for a break!', isLong ? `You completed ${sessions} sessions — take a long break.` : 'Take a short break.');
		if (state.active && !state.paused) {
			tracker.togglePause();
		}
	} else {
		state.pomo.phase = 'work';
		state.pomo.remainingMs = pomoPhaseMs('work');
		notify('Break over!', 'Time to focus.');
		if (state.active && state.paused) {
			tracker.togglePause();
		}
	}
}

function syncTray() {
	const elapsed = computeElapsedMs();
	const label = state.paused
		? `${formatDuration(elapsed)} ⏸`
		: formatDuration(elapsed);
	invoke('update_tray', { title: label }).catch(() => {});
}

function clearTray() {
	invoke('update_tray', { title: '' }).catch(() => {});
}

function startTicking() {
	stopTicking();
	state.tickNow = nowUtcIso();
	syncTray();
	setIntervalId('tick', setInterval(() => { state.tickNow = nowUtcIso(); syncTray(); pomoTick(); }, 1000));
	setIntervalId('midnight', setInterval(() => { enforceMidnight(); }, 30_000));
}

function stopTicking() {
	for (const key of ['tick', 'midnight']) {
		const id = getInterval(key);
		if (id) { clearInterval(id); setIntervalId(key, null); }
	}
}

async function enforceMidnight() {
	if (!state.active) return;
	const tz = localTzName();
	const startDay = localDayKey(state.active.started_at, tz);
	const todayKey = localDayKey(nowUtcIso(), tz);
	if (startDay !== todayKey) {
		const eod = localEndOfDayUtc(state.active.started_at, tz);
		await db.stopEntry(state.active.id, eod);
		state.active = { ...state.active, stopped_at: eod };
		stopTicking();
		clearTray();
		state.active = null;
		state.pauses = [];
		state.paused = false;
	}
}

function computeElapsedMs(): number {
	if (!state.active) return 0;
	const start = new Date(state.active.started_at).getTime();
	const end = state.active.stopped_at
		? new Date(state.active.stopped_at).getTime()
		: new Date(state.tickNow).getTime();
	let totalPauseMs = 0;
	for (const p of state.pauses) {
		const ps = new Date(p.started_at).getTime();
		const pe = p.stopped_at ? new Date(p.stopped_at).getTime() : new Date(state.tickNow).getTime();
		totalPauseMs += pe - ps;
	}
	return Math.max(0, end - start - totalPauseMs);
}

export const tracker = {
	get active() {
		return state.active;
	},
	get pauses() {
		return state.pauses;
	},
	get paused() {
		return state.paused;
	},
	get elapsedMs() {
		return computeElapsedMs();
	},
	get tickNow() {
		return state.tickNow;
	},
	get pomoPhase(): PomodoroPhase {
		return state.pomo.phase;
	},
	get pomoRemainingMs(): number {
		return state.pomo.remainingMs;
	},
	get pomoCompletedSessions(): number {
		return state.pomo.completedSessions;
	},
	get pomoTotalMs(): number {
		return pomoPhaseMs(state.pomo.phase);
	},

	pomoSkipBreak() {
		if (state.pomo.phase === 'work') return;
		state.pomo.phase = 'work';
		state.pomo.remainingMs = pomoPhaseMs('work');
		if (state.active && state.paused) {
			tracker.togglePause();
		}
	},

	pomoResetPhase() {
		state.pomo.remainingMs = pomoPhaseMs(state.pomo.phase);
	},

	async init() {
		// Kill any stale intervals from a previous HMR cycle
		stopTicking();
		// Merge adjacent entries with gaps < 2 minutes
		await db.mergeAdjacentEntries();
		const allOpen = await db.getAllOpenEntries();
		const tz = localTzName();
		const todayKey = localDayKey(nowUtcIso(), tz);
		let resumed = false;

		for (const e of allOpen) {
			const startDay = localDayKey(e.started_at, tz);
			if (!resumed && startDay === todayKey) {
				// Resume the most recent open entry from today
				state.active = e;
				state.pauses = await db.getPausesForEntry(e.id);
				state.paused = !!state.pauses.find((p) => !p.stopped_at);
				if (settings.pomodoro.enabled) {
					resetPomo();
				}
				startTicking();
				resumed = true;
			} else {
				// Close orphaned/stale entries
				const stopAt = startDay !== todayKey
					? localEndOfDayUtc(e.started_at, tz)
					: nowUtcIso();
				try { await db.stopEntry(e.id, stopAt); } catch {}
			}
		}

		if (!resumed) {
			state.active = null;
			state.pauses = [];
			state.paused = false;
			clearTray();
		}
	},

	async start() {
		if (state.active) return;
		// Close any orphaned open entries (unique index on NULL doesn't work in SQLite)
		const orphan = await db.getOpenEntry();
		if (orphan) {
			try { await db.stopEntry(orphan.id, nowUtcIso()); } catch {}
		}

		const CONTINUATION_GAP_MS = 2 * 60_000;
		const tz = localTzName();
		const todayKey = localDayKey(nowUtcIso(), tz);
		const recent = await db.getMostRecentStoppedEntry();

		if (recent && localDayKey(recent.started_at, tz) === todayKey && recent.stopped_at) {
			const gap = Date.now() - new Date(recent.stopped_at).getTime();
			if (gap < CONTINUATION_GAP_MS) {
				await db.reopenEntry(recent.id);
				state.active = { ...recent, stopped_at: null };
				state.pauses = await db.getPausesForEntry(recent.id);
				state.paused = false;
				if (settings.pomodoro.enabled) {
					resetPomo();
				}
				startTicking();
				return;
			}
		}

		const entry = await db.insertLiveEntry();
		state.active = entry;
		state.pauses = [];
		state.paused = false;
		if (settings.pomodoro.enabled) {
			resetPomo();
		}
		startTicking();
	},

	async stop(atUtc?: string) {
		if (!state.active) return;
		const stopAt = atUtc ?? nowUtcIso();
		try {
			if (state.paused) {
				const openPause = state.pauses.find((p) => !p.stopped_at);
				if (openPause) {
					await db.stopPause(openPause.id, stopAt);
				}
			}
			await db.stopEntry(state.active.id, stopAt);
		} catch (e) {
			console.error('Failed to stop entry in DB:', e);
		}
		state.active = null;
		state.pauses = [];
		state.paused = false;
		state.pomo = { phase: 'work', remainingMs: 0, completedSessions: 0 };
		stopTicking();
		clearTray();
	},

	async togglePause() {
		if (!state.active) return;
		if (state.paused) {
			const openPause = state.pauses.find((p) => !p.stopped_at);
			if (openPause) {
				const now = nowUtcIso();
				await db.stopPause(openPause.id, now);
				openPause.stopped_at = now;
				state.paused = false;
			}
		} else {
			const pause = await db.startPause(state.active.id);
			state.pauses = [...state.pauses, pause];
			state.paused = true;
		}
		syncTray();
	}
};
