<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { open as openDialog } from '@tauri-apps/plugin-dialog';
	import { appLocalDataDir, join } from '@tauri-apps/api/path';
	import { mkdir, exists } from '@tauri-apps/plugin-fs';
	import { settings } from '$lib/settings.svelte';
	import * as db from '$lib/db.svelte';

	const DEFAULT_FILENAME = 'worktime.db';

	let defaultDir = $state('');
	let folder = $state('');
	let filename = $state(DEFAULT_FILENAME);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const fullPath = $derived(joinPath(folder, filename));

	function joinPath(dir: string, name: string): string {
		if (!dir || !name) return '';
		const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
		const trimmed = dir.replace(/[\\/]+$/, '');
		const safeName = name.trim() || DEFAULT_FILENAME;
		return `${trimmed}${sep}${safeName}`;
	}

	function ensureDbExtension(name: string): string {
		const t = name.trim();
		if (!t) return DEFAULT_FILENAME;
		if (/\.(db|sqlite|sqlite3)$/i.test(t)) return t;
		return `${t}.db`;
	}

	onMount(async () => {
		defaultDir = await appLocalDataDir();
		folder = defaultDir;
	});

	async function pickFolder() {
		try {
			const picked = await openDialog({
				directory: true,
				multiple: false,
				defaultPath: folder || defaultDir,
				title: 'Choose where to store your worktime database'
			});
			if (typeof picked === 'string') folder = picked;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}

	async function useDefault() {
		folder = defaultDir;
		filename = DEFAULT_FILENAME;
		await create();
	}

	async function create() {
		if (busy) return;
		error = null;
		busy = true;
		try {
			const finalName = ensureDbExtension(filename);
			filename = finalName;
			const dir = folder || defaultDir;
			if (!(await exists(dir))) await mkdir(dir, { recursive: true });
			const path = await join(dir, finalName);
			await db.open(path);
			await settings.setDbPath(path);
			await goto('/', { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<main class="mx-auto max-w-2xl px-6 py-16">
	<header class="mb-10">
		<h1 class="mb-2 text-4xl">Welcome to Worktime</h1>
		<p class="text-[color:var(--color-fg-muted)]">
			Pick a location for your local database. It's a single SQLite file you can back up, sync, or move
			at any time.
		</p>
	</header>

	<section class="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm">
		<div class="space-y-5">
			<div>
				<label class="mb-1 block text-sm font-medium" for="folder-input">Folder</label>
				<div class="flex gap-2">
					<input
						id="folder-input"
						type="text"
						class="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
						bind:value={folder}
						placeholder={defaultDir}
					/>
					<button
						type="button"
						class="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-2 text-sm transition hover:bg-[color:var(--color-surface-2)]"
						onclick={pickFolder}
					>
						Browse…
					</button>
				</div>
			</div>

			<div>
				<label class="mb-1 block text-sm font-medium" for="filename-input">File name</label>
				<input
					id="filename-input"
					type="text"
					class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
					bind:value={filename}
					placeholder={DEFAULT_FILENAME}
				/>
				<p class="mt-1 text-xs text-[color:var(--color-fg-faint)]">
					Will become <code class="font-mono">{ensureDbExtension(filename)}</code> if no extension is given.
				</p>
			</div>

			<div class="selectable rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 font-mono text-xs text-[color:var(--color-fg-muted)]">
				{fullPath || 'Choose a folder…'}
			</div>

			{#if error}
				<p class="rounded-lg bg-[color:var(--color-accent-soft)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
					{error}
				</p>
			{/if}

			<div class="flex flex-wrap gap-3 pt-2">
				<button
					type="button"
					class="rounded-lg bg-[color:var(--color-accent)] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[color:var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
					onclick={create}
					disabled={busy || !folder}
				>
					{busy ? 'Creating…' : 'Create database'}
				</button>
				<button
					type="button"
					class="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-5 py-2.5 text-sm transition hover:bg-[color:var(--color-surface-2)]"
					onclick={useDefault}
					disabled={busy}
				>
					Use default location
				</button>
			</div>
		</div>
	</section>
</main>
