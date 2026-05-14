<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import * as db from '$lib/db.svelte';
	import type { DayNote } from '$lib/db.svelte';
	import { formatDayLabel } from '$lib/time';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';

	const dayKey = $derived(page.params.day ?? '');
	const dayLabel = $derived(formatDayLabel(dayKey));

	let notes = $state<DayNote[]>([]);
	let newBody = $state('');
	let busy = $state(false);
	let editingTimeId = $state<number | null>(null);
	let editingBodyId = $state<number | null>(null);
	let editBodyText = $state('');
	let noteCards = new Map<number, HTMLElement>();

	function trackCard(node: HTMLElement, id: number) {
		noteCards.set(id, node);
		return { destroy() { noteCards.delete(id); } };
	}

	onMount(() => loadNotes());

	async function loadNotes() {
		notes = await db.getNotesForDay(dayKey);
	}

	async function addNote() {
		if (!newBody.trim() || busy) return;
		busy = true;
		try {
			await db.insertDayNote(dayKey, newBody.trim());
			newBody = '';
			await loadNotes();
		} finally {
			busy = false;
		}
	}

	function startEditingBody(note: DayNote) {
		editingBodyId = note.id;
		editBodyText = note.body;
	}

	async function saveBody(id: number) {
		if (editingBodyId !== id) return;
		if (!editBodyText.trim()) return;
		await db.updateDayNoteBody(id, editBodyText.trim());
		editingBodyId = null;
		await loadNotes();
	}

	$effect(() => {
		if (editingBodyId === null && editingTimeId === null) return;
		function onClick(e: MouseEvent) {
			const target = e.target as Node;
			for (const el of noteCards.values()) {
				if (el.contains(target)) return;
			}
			if (editingBodyId !== null) saveBody(editingBodyId);
			if (editingTimeId !== null) editingTimeId = null;
		}
		document.addEventListener('click', onClick, true);
		return () => document.removeEventListener('click', onClick, true);
	});

	async function removeNote(id: number) {
		await db.deleteDayNote(id);
		await loadNotes();
	}

	async function updateTime(id: number, timeStr: string) {
		const createdAt = `${dayKey}T${timeStr}:00`;
		await db.updateDayNoteTime(id, new Date(createdAt).toISOString());
		editingTimeId = null;
		await loadNotes();
	}

	function formatTime(createdAt: string): string {
		return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(createdAt));
	}

	function toTimeValue(createdAt: string): string {
		const d = new Date(createdAt);
		return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	}
</script>

<main class="mx-auto max-w-2xl px-6 py-12">
	<header class="mb-10 flex items-center justify-between">
		<div>
			<h1 class="text-4xl">{dayLabel}</h1>
		</div>
		<a href="/" class="btn-outline">
			<ArrowLeft size={16} />
			Back
		</a>
	</header>

	<div class="mb-8 flex items-end gap-2 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2 shadow-sm focus-within:border-[color:var(--color-accent)]">
		<textarea
			class="flex-1 resize-none border-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-[color:var(--color-fg-faint)]"
			rows={1}
			placeholder="Write a note…"
			bind:value={newBody}
			onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
			oninput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
		></textarea>
		<button
			type="button"
			class="grid size-8 shrink-0 place-items-center rounded-lg transition {newBody.trim() ? 'bg-[color:var(--color-accent)] text-white hover:bg-[color:var(--color-accent-hover)]' : 'text-[color:var(--color-fg-faint)]'} disabled:opacity-40"
			onclick={addNote}
			disabled={busy || !newBody.trim()}
		>
			<ArrowUp size={16} strokeWidth={2.5} />
		</button>
	</div>

	<section>
		{#if notes.length === 0}
			<div class="py-10 text-center text-[color:var(--color-fg-muted)]">
				No notes yet.
			</div>
		{:else}
			{#each notes as note, i (note.id)}
				{#if i > 0}
					<div class="ml-5 h-3 border-l-2 border-[color:var(--color-border)]"></div>
				{/if}
				<div class="group rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3 shadow-sm" use:trackCard={note.id}>
					<div class="mb-2 flex items-center justify-between">
						{#if editingTimeId === note.id}
							<input
								type="time"
								class="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-2 py-1 font-mono text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
								value={toTimeValue(note.created_at)}
								onchange={(e) => updateTime(note.id, (e.target as HTMLInputElement).value)}
							/>
						{:else}
							<button
								type="button"
								class="rounded-md px-2 py-1 font-mono text-sm text-[color:var(--color-fg-muted)] transition hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-fg)]"
								onclick={() => (editingTimeId = note.id)}
								title="Click to edit time"
							>
								{formatTime(note.created_at)}
							</button>
						{/if}
						<button
							type="button"
							class="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-[color:var(--color-danger)] opacity-0 transition hover:bg-[color:var(--color-surface-2)] group-hover:opacity-100"
							onclick={() => removeNote(note.id)}
						>
							<Trash2 size={14} />
							Remove
						</button>
					</div>
					{#if editingBodyId === note.id}
						<textarea
							class="w-full resize-none rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
							rows={3}
							bind:value={editBodyText}
							onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveBody(note.id); } if (e.key === 'Escape') { editingBodyId = null; } }}
						></textarea>
					{:else}
						<button
							type="button"
							class="w-full cursor-text whitespace-pre-wrap rounded-md px-1 py-0.5 text-left text-sm transition hover:bg-[color:var(--color-surface-2)]"
							onclick={() => startEditingBody(note)}
						>{note.body}</button>
					{/if}
				</div>
			{/each}
		{/if}
	</section>
</main>
