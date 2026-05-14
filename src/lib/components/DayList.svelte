<script lang="ts">
	import type { Entry } from '$lib/db.svelte';
	import { localDayKey, localTzName, formatHoursShort, formatDayLabel } from '$lib/time';
	import EntryRow from './EntryRow.svelte';
	import AddNoteDialog from './AddNoteDialog.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import MessageSquareText from '@lucide/svelte/icons/message-square-text';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Briefcase from '@lucide/svelte/icons/briefcase';
	import Coffee from '@lucide/svelte/icons/coffee';

	let {
		entries,
		pauseTotals,
		noteCounts,
		onUpdated,
	}: {
		entries: Entry[];
		pauseTotals: Map<number, number>;
		noteCounts: Map<string, number>;
		onUpdated?: () => void;
	} = $props();

	const tz = localTzName();

	let addNoteOpen = $state(false);
	let addNoteDayKey = $state('');

	type DayGroup = {
		dayKey: string;
		label: string;
		totalMs: number;
		pauseMs: number;
		entries: Entry[];
	};

	const grouped = $derived.by(() => {
		const map = new Map<string, Entry[]>();
		for (const e of entries) {
			const key = localDayKey(e.started_at, tz);
			const list = map.get(key);
			if (list) list.push(e);
			else map.set(key, [e]);
		}
		const result: DayGroup[] = [];
		for (const [dayKey, dayEntries] of map) {
			let totalMs = 0;
			let dayPauseMs = 0;
			for (const e of dayEntries) {
				const start = new Date(e.started_at).getTime();
				const end = e.stopped_at ? new Date(e.stopped_at).getTime() : Date.now();
				const rawMs = Math.max(0, end - start);
				const pMs = Math.min(pauseTotals.get(e.id) ?? 0, rawMs);
				totalMs += rawMs - pMs;
				dayPauseMs += pMs;
			}
			result.push({ dayKey, label: formatDayLabel(dayKey, tz), totalMs, pauseMs: dayPauseMs, entries: dayEntries });
		}
		result.sort((a, b) => b.dayKey.localeCompare(a.dayKey));
		return result;
	});

	function openAddNote(dayKey: string) {
		addNoteDayKey = dayKey;
		addNoteOpen = true;
	}
</script>

{#if grouped.length === 0}
	<div class="py-10 text-center text-[color:var(--color-fg-muted)]">
		No entries yet. Hit Start to begin tracking.
	</div>
{:else}
	<div class="space-y-6">
		{#each grouped as day (day.dayKey)}
			<section>
				<div class="mb-2 flex items-center justify-between border-b border-[color:var(--color-border)] pb-1">
					<h3 class="text-sm font-semibold">{day.label}</h3>
					<div class="flex items-center gap-4">
						<div class="flex items-center gap-1.5">
							<span class="inline-flex h-5 items-center gap-1 rounded-md bg-[color:var(--color-accent)]/10 px-2 font-mono text-xs text-[color:var(--color-accent)]">
								<span style="transform: translateY(-0.75px)"><Briefcase size={11} /></span>
								<span style="transform: translateY(0.25px)">{formatHoursShort(day.totalMs)}</span>
							</span>
							{#if day.pauseMs > 0}
								<span class="inline-flex h-5 items-center gap-1 rounded-md bg-[color:var(--color-surface-2)] px-2 font-mono text-xs text-[color:var(--color-fg-faint)]">
									<span style="transform: translateY(-0.75px)"><Coffee size={11} /></span>
									<span style="transform: translateY(0.25px)">{formatHoursShort(day.pauseMs)}</span>
								</span>
							{/if}
						</div>
						<div class="flex items-center gap-0.5">
							<button
								type="button"
								class="btn-icon"
								onclick={() => openAddNote(day.dayKey)}
								title="Add note"
							>
								<Plus size={14} />
							</button>
							<a
								href="/notes/{day.dayKey}"
								class="flex h-6 items-center gap-1 rounded-md px-2 text-xs text-[color:var(--color-fg-muted)] transition hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-fg)]"
							>
								<MessageSquareText size={12} />
								<span class="font-medium">{noteCounts.get(day.dayKey) ?? 0}</span>
								<ChevronRight size={12} />
							</a>
						</div>
					</div>
				</div>
				<div class="space-y-0.5">
					{#each day.entries as entry (entry.id)}
						<EntryRow {entry} {onUpdated} pauseMs={pauseTotals.get(entry.id) ?? 0} />
					{/each}
				</div>
			</section>
		{/each}
	</div>
{/if}

<AddNoteDialog bind:open={addNoteOpen} dayKey={addNoteDayKey} onSaved={onUpdated} />
