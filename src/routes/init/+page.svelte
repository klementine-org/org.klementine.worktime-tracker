<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { open as openDialog } from '@tauri-apps/plugin-dialog';
	import { appLocalDataDir, join } from '@tauri-apps/api/path';
	import { mkdir, exists } from '@tauri-apps/plugin-fs';
	import { settings } from '$lib/settings.svelte';
	import * as db from '$lib/db.svelte';

	const DEFAULT_FILENAME = 'worktime.db';

	let defaultPath = $state('');
	let scanning = $state(true);
	let found = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);

	onMount(async () => {
		const dir = await appLocalDataDir();
		defaultPath = await join(dir, DEFAULT_FILENAME);
		found = await exists(defaultPath);
		scanning = false;
	});

	async function openExisting() {
		if (busy) return;
		busy = true;
		error = null;
		try {
			await db.open(defaultPath);
			await settings.setDbPath(defaultPath);
			await goto('/', { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	async function createNew() {
		if (busy) return;
		busy = true;
		error = null;
		try {
			const dir = await appLocalDataDir();
			if (!(await exists(dir))) await mkdir(dir, { recursive: true });
			await db.open(defaultPath);
			await settings.setDbPath(defaultPath);
			await goto('/', { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	async function pickFile() {
		if (busy) return;
		busy = true;
		error = null;
		try {
			const picked = await openDialog({
				directory: false,
				multiple: false,
				title: 'Open an existing worktime database',
				filters: [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }]
			});
			if (typeof picked !== 'string') {
				busy = false;
				return;
			}
			await db.open(picked);
			await settings.setDbPath(picked);
			await goto('/', { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<main class="mx-auto max-w-md px-6 py-20">
	<header class="mb-10 text-center">
		<h1 class="mb-2 text-4xl">Worktime Tracker</h1>
		<p class="text-[color:var(--color-fg-muted)]">
			Your data lives in a single SQLite file you can back up, sync, or move at any time.
		</p>
	</header>

	{#if scanning}
		<div class="py-10 text-center text-[color:var(--color-fg-muted)]">Scanning…</div>
	{:else}
		<section class="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm">
			{#if found}
				<p class="mb-2 text-sm font-medium">Found an existing database</p>
				<p class="mb-5 rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 font-mono text-xs text-[color:var(--color-fg-muted)] break-all">
					{defaultPath}
				</p>
				<button
					type="button"
					class="w-full rounded-lg bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[color:var(--color-accent-hover)] disabled:opacity-60"
					onclick={openExisting}
					disabled={busy}
				>
					{busy ? 'Opening…' : 'Open database'}
				</button>
			{:else}
				<p class="mb-2 text-sm font-medium">No database found</p>
				<p class="mb-5 rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 font-mono text-xs text-[color:var(--color-fg-muted)] break-all">
					{defaultPath}
				</p>
				<button
					type="button"
					class="w-full rounded-lg bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[color:var(--color-accent-hover)] disabled:opacity-60"
					onclick={createNew}
					disabled={busy}
				>
					{busy ? 'Creating…' : 'Create new database'}
				</button>
			{/if}

			{#if error}
				<p class="mt-4 rounded-lg bg-[color:var(--color-accent-soft)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
					{error}
				</p>
			{/if}
		</section>

		<div class="mt-4 text-center">
			<button
				type="button"
				class="text-sm text-[color:var(--color-fg-muted)] underline decoration-[color:var(--color-border)] underline-offset-2 transition hover:text-[color:var(--color-fg)]"
				onclick={pickFile}
				disabled={busy}
			>
				Open a different file…
			</button>
		</div>
	{/if}
</main>
