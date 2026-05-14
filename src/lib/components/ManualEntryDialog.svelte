<script lang="ts">
	import { localTzName, localDayKey, nowUtcIso } from '$lib/time';
	import * as db from '$lib/db.svelte';

	let { open = $bindable(false), onSaved }: { open: boolean; onSaved?: () => void } = $props();

	const tz = localTzName();
	const today = localDayKey(nowUtcIso(), tz);

	let date = $state(today);
	let startTime = $state('09:00');
	let endTime = $state('17:00');
	let note = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	function localToUtc(dateStr: string, timeStr: string): string {
		const parts = `${dateStr}T${timeStr}:00`;
		const local = new Date(parts);
		return local.toISOString();
	}

	async function save() {
		error = null;
		busy = true;
		try {
			const startedAt = localToUtc(date, startTime);
			const stoppedAt = localToUtc(date, endTime);
			if (stoppedAt <= startedAt) {
				error = 'End time must be after start time.';
				return;
			}
			const diffMs = new Date(stoppedAt).getTime() - new Date(startedAt).getTime();
			if (diffMs > 86_400_000) {
				error = 'Entry must be 24 hours or less.';
				return;
			}
			await db.insertManualEntry(startedAt, stoppedAt, note.trim() || null);
			open = false;
			date = today;
			startTime = '09:00';
			endTime = '17:00';
			note = '';
			onSaved?.();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
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
			<h2 class="mb-4 text-xl">Manual entry</h2>

			<div class="space-y-4">
				<div>
					<label class="mb-1 block text-sm font-medium" for="me-date">Date</label>
					<input
						id="me-date"
						type="date"
						class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
						bind:value={date}
					/>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="mb-1 block text-sm font-medium" for="me-start">Start</label>
						<input
							id="me-start"
							type="time"
							class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
							bind:value={startTime}
						/>
					</div>
					<div>
						<label class="mb-1 block text-sm font-medium" for="me-end">End</label>
						<input
							id="me-end"
							type="time"
							class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
							bind:value={endTime}
						/>
					</div>
				</div>
				<div>
					<label class="mb-1 block text-sm font-medium" for="me-note">Note (optional)</label>
					<input
						id="me-note"
						type="text"
						class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
						bind:value={note}
						placeholder="What did you work on?"
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
						Cancel
					</button>
					<button
						type="button"
						class="rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[color:var(--color-accent-hover)] disabled:opacity-60"
						onclick={save}
						disabled={busy}
					>
						{busy ? 'Saving…' : 'Save'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
