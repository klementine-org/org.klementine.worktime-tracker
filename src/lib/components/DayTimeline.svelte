<script lang="ts">
	import type { Entry, Pause } from '$lib/db.svelte';
	import * as db from '$lib/db.svelte';
	import { tracker } from '$lib/tracker.svelte';
	import { localTzName, localDayKey, formatDayLabel } from '$lib/time';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { entries, dayKey, onPrevDay, onNextDay }: {
		entries: Entry[];
		dayKey: string;
		onPrevDay?: () => void;
		onNextDay?: () => void;
	} = $props();

	const tz = localTzName();

	type Segment = { startPct: number; widthPct: number; type: 'work' | 'pause' };

	let pausesByEntry = $state<Map<number, Pause[]>>(new Map());

	const dayEntries = $derived(
		entries.filter(e => localDayKey(e.started_at, tz) === dayKey)
	);

	$effect(() => {
		loadPauses();
	});

	async function loadPauses() {
		const ids = dayEntries.map(e => e.id);
		if (ids.length === 0) { pausesByEntry = new Map(); return; }
		const map = new Map<number, Pause[]>();
		for (const id of ids) {
			map.set(id, await db.getPausesForEntry(id));
		}
		pausesByEntry = map;
	}

	const timeRange = $derived.by(() => {
		if (dayEntries.length === 0) return { startMs: 0, endMs: 0, spanMs: 1 };
		let earliest = Infinity;
		let latest = -Infinity;
		for (const e of dayEntries) {
			const s = new Date(e.started_at).getTime();
			const end = e.stopped_at
				? new Date(e.stopped_at).getTime()
				: (tracker.active?.id === e.id ? new Date(tracker.tickNow).getTime() : Date.now());
			if (s < earliest) earliest = s;
			if (end > latest) latest = end;
		}
		const startMs = earliest;
		const nextHour = Math.ceil(latest / 3_600_000) * 3_600_000;
		const endMs = Math.max(nextHour, earliest + 12 * 3_600_000);
		return { startMs, endMs, spanMs: endMs - startMs };
	});

	const segments = $derived.by(() => {
		const { startMs, spanMs } = timeRange;
		const raw: Segment[] = [];

		for (const e of dayEntries) {
			const eStart = new Date(e.started_at).getTime();
			const eEnd = e.stopped_at
				? new Date(e.stopped_at).getTime()
				: (tracker.active?.id === e.id ? new Date(tracker.tickNow).getTime() : Date.now());
			const pauses = (pausesByEntry.get(e.id) ?? [])
				.filter(p => p.stopped_at)
				.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

			let cursor = eStart;
			for (const p of pauses) {
				const pStart = new Date(p.started_at).getTime();
				const pEnd = new Date(p.stopped_at!).getTime();
				if (pStart > cursor) {
					raw.push({
						startPct: ((cursor - startMs) / spanMs) * 100,
						widthPct: ((pStart - cursor) / spanMs) * 100,
						type: 'work'
					});
				}
				raw.push({
					startPct: ((pStart - startMs) / spanMs) * 100,
					widthPct: ((pEnd - pStart) / spanMs) * 100,
					type: 'pause'
				});
				cursor = pEnd;
			}
			if (cursor < eEnd) {
				raw.push({
					startPct: ((cursor - startMs) / spanMs) * 100,
					widthPct: ((eEnd - cursor) / spanMs) * 100,
					type: 'work'
				});
			}
		}

		raw.sort((a, b) => a.startPct - b.startPct);
		const merged: Segment[] = [];
		for (const seg of raw) {
			const prev = merged[merged.length - 1];
			if (prev && prev.type === seg.type) {
				const prevEnd = prev.startPct + prev.widthPct;
				const gap = seg.startPct - prevEnd;
				if (gap < 2) {
					const newEnd = Math.max(prevEnd, seg.startPct + seg.widthPct);
					prev.widthPct = newEnd - prev.startPct;
					continue;
				}
			}
			merged.push({ ...seg });
		}
		return merged;
	});

	function formatHourMin(ms: number): string {
		const d = new Date(ms);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}

	const timeMarkers = $derived.by(() => {
		if (dayEntries.length === 0) return [];
		const { startMs, endMs, spanMs } = timeRange;
		const markers: { pct: number; label: string }[] = [];
		const stepMs = 3_600_000;
		const firstHour = Math.ceil(startMs / stepMs) * stepMs;
		for (let t = firstHour; t <= endMs; t += stepMs) {
			const pct = ((t - startMs) / spanMs) * 100;
			if (pct > 1 && pct < 99) {
				markers.push({ pct, label: formatHourMin(t) });
			}
		}
		return markers;
	});

	const dayLabel = $derived(formatDayLabel(dayKey, tz));
</script>

<div>
	<div class="mb-4 flex items-center gap-2">
		<button type="button" class="btn-icon" onclick={onPrevDay}>
			<ChevronLeft size={16} />
		</button>
		<p class="text-sm font-medium text-[color:var(--color-fg-muted)]">{dayLabel} · {dayKey}</p>
		<button type="button" class="btn-icon" onclick={onNextDay}>
			<ChevronRight size={16} />
		</button>
	</div>

	{#if dayEntries.length === 0}
		<div class="flex h-12 items-center justify-center text-sm text-[color:var(--color-fg-muted)]">
			No entries for this day
		</div>
	{:else}
		<div class="relative h-4">
			{#each timeMarkers as marker (marker.pct)}
				<span
					class="absolute -translate-x-1/2 font-mono text-[10px] text-[color:var(--color-fg-faint)]"
					style="left: {marker.pct}%;"
				>{marker.label}</span>
			{/each}
		</div>

		<div class="relative mt-1.5 h-12 overflow-visible">
			{#each segments as seg, i (i)}
				<div
					class="absolute top-0.5 bottom-0.5 rounded-md {seg.type === 'work' ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-fg-muted)]'}"
					style="left: calc({seg.startPct}% + 1px); width: calc({Math.min(seg.widthPct, 100 - seg.startPct)}% - 2px); min-width: 4px; opacity: {seg.type === 'work' ? 1 : 0.2};"
				></div>
			{/each}
		</div>
	{/if}
</div>
