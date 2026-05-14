<script lang="ts">
	import { localDayKey, nowUtcIso, localTzName } from '$lib/time';
	import * as db from '$lib/db.svelte';
	import type { Vacation } from '$lib/db.svelte';

	let { open = $bindable(false), onSaved }: { open: boolean; onSaved?: () => void } = $props();

	const today = localDayKey(nowUtcIso(), localTzName());

	let startDate = $state(today);
	let endDate = $state(today);
	let excludeWeekends = $state(true);
	let note = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	let vacations = $state<Vacation[]>([]);
	let loadingList = $state(false);

	async function loadVacations() {
		loadingList = true;
		try {
			vacations = await db.getVacations();
		} finally {
			loadingList = false;
		}
	}

	$effect(() => {
		if (open) loadVacations();
	});

	const dayCount = $derived.by(() => {
		if (!startDate || !endDate) return 0;
		const s = new Date(startDate + 'T00:00:00');
		const e = new Date(endDate + 'T00:00:00');
		if (e < s) return 0;
		let count = 0;
		for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
			const dow = d.getDay();
			if (excludeWeekends && (dow === 0 || dow === 6)) continue;
			count++;
		}
		return count;
	});

	async function save() {
		error = null;
		if (!startDate || !endDate) { error = 'Pick both dates.'; return; }
		if (endDate < startDate) { error = 'End date must be on or after start date.'; return; }
		if (dayCount === 0) { error = 'No days in selected range (all weekends?).'; return; }
		busy = true;
		try {
			await db.insertVacation(startDate, endDate, excludeWeekends, note.trim() || null);
			startDate = today;
			endDate = today;
			note = '';
			excludeWeekends = true;
			await loadVacations();
			onSaved?.();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	async function remove(id: number) {
		await db.deleteVacation(id);
		await loadVacations();
		onSaved?.();
	}

	function formatRange(v: Vacation): string {
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
		const s = new Date(v.start_date + 'T00:00:00');
		const e = new Date(v.end_date + 'T00:00:00');
		const sf = s.toLocaleDateString([], opts);
		const ef = e.toLocaleDateString([], opts);
		return v.start_date === v.end_date ? sf : `${sf} – ${ef}`;
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		tabindex={-1}
		onclick={(e) => { if (e.target === e.currentTarget) open = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') open = false; }}
	>
		<div class="w-full max-w-md rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-6 shadow-xl">
			<h2 class="mb-4 text-xl">Vacation</h2>

			<div class="space-y-4">
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="mb-1 block text-sm font-medium" for="vac-start">From</label>
						<input
							id="vac-start"
							type="date"
							class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
							bind:value={startDate}
						/>
					</div>
					<div>
						<label class="mb-1 block text-sm font-medium" for="vac-end">To</label>
						<input
							id="vac-end"
							type="date"
							class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
							bind:value={endDate}
						/>
					</div>
				</div>

				<label class="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						class="size-4 rounded accent-[color:var(--color-accent)]"
						bind:checked={excludeWeekends}
					/>
					Exclude weekends
				</label>

				{#if dayCount > 0}
					<p class="text-sm text-[color:var(--color-fg-muted)]">
						{dayCount} vacation day{dayCount === 1 ? '' : 's'}
					</p>
				{/if}

				<div>
					<label class="mb-1 block text-sm font-medium" for="vac-note">Note (optional)</label>
					<input
						id="vac-note"
						type="text"
						class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
						bind:value={note}
						placeholder="e.g. Summer holiday"
					/>
				</div>

				{#if error}
					<p class="rounded-lg bg-[color:var(--color-accent-soft)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
						{error}
					</p>
				{/if}

				<div class="flex justify-end gap-2 pt-2">
					<button
						type="button"
						class="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm transition hover:bg-[color:var(--color-surface-2)]"
						onclick={() => (open = false)}
					>
						Close
					</button>
					<button
						type="button"
						class="rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[color:var(--color-accent-hover)] disabled:opacity-60"
						onclick={save}
						disabled={busy || dayCount === 0}
					>
						{busy ? 'Saving…' : 'Add vacation'}
					</button>
				</div>
			</div>

			{#if vacations.length > 0}
				<hr class="my-5 border-[color:var(--color-border)]" />
				<h3 class="mb-3 text-sm font-medium text-[color:var(--color-fg-muted)]">Saved vacations</h3>
				<ul class="space-y-2">
					{#each vacations as v (v.id)}
						<li class="flex items-center justify-between rounded-lg bg-[color:var(--color-surface)] px-3 py-2 text-sm">
							<div>
								<span class="font-medium">{formatRange(v)}</span>
								{#if v.note}
									<span class="ml-2 text-[color:var(--color-fg-muted)]">— {v.note}</span>
								{/if}
								{#if !v.exclude_weekends}
									<span class="ml-2 rounded bg-[color:var(--color-surface-2)] px-1.5 py-0.5 text-xs text-[color:var(--color-fg-muted)]">incl. weekends</span>
								{/if}
							</div>
							<button
								type="button"
								class="ml-3 text-xs text-[color:var(--color-danger)] transition hover:opacity-70"
								onclick={() => remove(v.id)}
							>
								Remove
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
{/if}
