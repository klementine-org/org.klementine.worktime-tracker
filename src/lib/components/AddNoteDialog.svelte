<script lang="ts">
	import * as db from '$lib/db.svelte';

	let {
		open = $bindable(false),
		dayKey,
		onSaved
	}: {
		open: boolean;
		dayKey: string;
		onSaved?: () => void;
	} = $props();

	let body = $state('');
	let time = $state(currentTime());
	let busy = $state(false);

	function currentTime(): string {
		const now = new Date();
		return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
	}

	$effect(() => {
		if (open) time = currentTime();
	});

	async function save() {
		if (!body.trim() || busy) return;
		busy = true;
		try {
			const createdAt = `${dayKey}T${time}:00`;
			const entry = await db.insertDayNote(dayKey, body.trim());
			await db.updateDayNoteTime(entry.id, new Date(createdAt).toISOString());
			body = '';
			open = false;
			onSaved?.();
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
			<h2 class="mb-4 text-xl">Add note</h2>
			<div class="mb-3 flex items-center gap-3">
				<span class="text-sm text-[color:var(--color-fg-muted)]">{dayKey}</span>
				<input
					type="time"
					class="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
					bind:value={time}
				/>
			</div>
			<textarea
				class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
				rows={3}
				placeholder="What are you working on?"
				bind:value={body}
				onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } }}
			></textarea>
			<div class="mt-4 flex justify-end gap-2">
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
					disabled={busy || !body.trim()}
				>
					{busy ? 'Saving…' : 'Add'}
				</button>
			</div>
		</div>
	</div>
{/if}
