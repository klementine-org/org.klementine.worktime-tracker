<script lang="ts">
	import type { Entry } from '$lib/db.svelte';
	import * as db from '$lib/db.svelte';
	import { tracker } from '$lib/tracker.svelte';
	import { formatDuration, formatTimeOfDay, localTzName } from '$lib/time';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import Pause from '@lucide/svelte/icons/pause';

	let { entry, onUpdated, pauseMs = 0 }: { entry: Entry; onUpdated?: () => void; pauseMs?: number } = $props();

	const isTracked = $derived(tracker.active?.id === entry.id);

	const tz = localTzName();

	let editing = $state(false);
	let editStart = $state('');
	let editEnd = $state('');
	let error = $state<string | null>(null);
	let editContainer = $state<HTMLElement | null>(null);

	const rawMs = $derived(
		isTracked
			? tracker.elapsedMs
			: entry.stopped_at
				? new Date(entry.stopped_at).getTime() - new Date(entry.started_at).getTime()
				: Date.now() - new Date(entry.started_at).getTime()
	);
	const effectivePauseMs = $derived(Math.min(pauseMs, Math.max(0, rawMs)));
	const durationMs = $derived(isTracked ? rawMs : Math.max(0, rawMs - effectivePauseMs));

	function toLocalTimeValue(utcIso: string): string {
		const d = new Date(utcIso);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}

	function localTimeToUtc(dateRef: string, timeStr: string): string {
		const refDate = new Date(dateRef);
		const [h, m] = timeStr.split(':').map(Number);
		const local = new Date(refDate);
		local.setHours(h, m, 0, 0);
		return local.toISOString();
	}

	function startEditing() {
		if (!entry.stopped_at) return;
		editStart = toLocalTimeValue(entry.started_at);
		editEnd = toLocalTimeValue(entry.stopped_at);
		error = null;
		editing = true;
	}

	async function save() {
		if (!entry.stopped_at) return;
		const newStart = localTimeToUtc(entry.started_at, editStart);
		const newEnd = localTimeToUtc(entry.started_at, editEnd);
		if (newEnd <= newStart) {
			error = 'End must be after start';
			return;
		}
		const diffMs = new Date(newEnd).getTime() - new Date(newStart).getTime();
		if (diffMs > 86_400_000) {
			error = 'Max 24 hours';
			return;
		}
		try {
			await db.updateEntryTimes(entry.id, newStart, newEnd);
			editing = false;
			error = null;
			onUpdated?.();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function cancel() {
		editing = false;
		error = null;
	}

	async function remove() {
		if (!entry.stopped_at) return;
		await db.deleteEntry(entry.id);
		onUpdated?.();
	}

	$effect(() => {
		if (!editing) return;
		function onClick(e: MouseEvent) {
			if (editContainer && !editContainer.contains(e.target as Node)) {
				cancel();
			}
		}
		document.addEventListener('click', onClick, true);
		return () => document.removeEventListener('click', onClick, true);
	});
</script>

<div class="group flex items-center justify-between rounded-lg px-3 py-2 transition hover:bg-[color:var(--color-surface-2)]">
	<div class="flex items-center gap-3">
		<span class="inline-block h-2 w-2 rounded-full {isTracked ? 'animate-breathe bg-[color:var(--color-success)]' : 'bg-[color:var(--color-fg-faint)]'}"></span>
		{#if editing}
			<div class="flex items-center gap-1.5" bind:this={editContainer}>
				<input
					type="time"
					class="w-24 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 font-mono text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
					bind:value={editStart}
				/>
				<span class="text-sm text-[color:var(--color-fg-muted)]">–</span>
				<input
					type="time"
					class="w-24 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 font-mono text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
					bind:value={editEnd}
				/>
				<button
					type="button"
					class="rounded-md bg-[color:var(--color-accent)] px-2.5 py-1 text-xs font-medium text-white transition hover:bg-[color:var(--color-accent-hover)]"
					onclick={save}
				>
					Save
				</button>
				<button
					type="button"
					class="rounded-md px-2.5 py-1 text-xs text-[color:var(--color-fg-muted)] transition hover:bg-[color:var(--color-surface-2)]"
					onclick={cancel}
				>
					Cancel
				</button>
				{#if error}
					<span class="text-xs text-[color:var(--color-danger)]">{error}</span>
				{/if}
			</div>
		{:else}
			<button
				type="button"
				class="rounded-md px-1 py-0.5 text-sm transition {entry.stopped_at && !isTracked ? 'hover:bg-[color:var(--color-surface)] hover:text-[color:var(--color-accent)]' : ''}"
				onclick={startEditing}
				disabled={!entry.stopped_at || isTracked}
				title={entry.stopped_at && !isTracked ? 'Click to edit times' : ''}
			>
				{formatTimeOfDay(entry.started_at, tz)}{#if isTracked}&ensp;– now{:else if entry.stopped_at}&ensp;–&ensp;{formatTimeOfDay(entry.stopped_at, tz)}{:else}&ensp;–&ensp;?{/if}
			</button>
		{/if}
		{#if entry.source === 'manual' && !editing}
			<span class="rounded bg-[color:var(--color-accent-soft)] px-1.5 py-0.5 text-xs text-[color:var(--color-accent)]">manual</span>
		{/if}
	</div>
	{#if !editing}
		<div class="flex items-center">
			{#if effectivePauseMs > 0 && !isTracked}
				<span class="mr-1.5 flex items-center gap-0.5 text-[color:var(--color-fg-faint)]" title="Paused {formatDuration(effectivePauseMs)}">
					<Pause size={10} />
					<span class="font-mono text-[10px]">{formatDuration(effectivePauseMs)}</span>
				</span>
			{/if}
			<span class="font-mono text-sm text-[color:var(--color-fg-muted)]">
				{formatDuration(durationMs)}
			</span>
			{#if entry.stopped_at}
				<div class="w-0 overflow-hidden transition-[width] duration-100 ease-out group-hover:w-8 group-hover:delay-150 group-hover:duration-150 group-hover:ease-in">
					<button
						type="button"
						class="ml-2 grid size-6 place-items-center rounded text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface)]"
						onclick={remove}
						title="Delete entry"
					>
						<Trash2 size={14} />
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
