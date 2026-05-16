<script lang="ts">
	import { goto } from '$app/navigation';
	import { open as openDialog } from '@tauri-apps/plugin-dialog';
	import { copyFile, exists, mkdir } from '@tauri-apps/plugin-fs';
	import { join, basename } from '@tauri-apps/api/path';
	import { settings, DEFAULT_POMODORO, type WeekDay } from '$lib/settings.svelte';
	import * as db from '$lib/db.svelte';

	let pomoEnabled = $state(settings.pomodoro.enabled);
	let pomoWork = $state(settings.pomodoro.workMins);
	let pomoShort = $state(settings.pomodoro.shortBreakMins);
	let pomoLong = $state(settings.pomodoro.longBreakMins);
	let pomoSessions = $state(settings.pomodoro.sessionsBeforeLong);

	$effect(() => {
		pomoEnabled = settings.pomodoro.enabled;
		pomoWork = settings.pomodoro.workMins;
		pomoShort = settings.pomodoro.shortBreakMins;
		pomoLong = settings.pomodoro.longBreakMins;
		pomoSessions = settings.pomodoro.sessionsBeforeLong;
	});

	async function savePomo() {
		await settings.setPomodoro({
			enabled: pomoEnabled,
			workMins: pomoWork,
			shortBreakMins: pomoShort,
			longBreakMins: pomoLong,
			sessionsBeforeLong: pomoSessions,
		});
	}

	let pomoResetMsg = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let info = $state<string | null>(null);

	const WEEKDAY_OPTIONS: { value: WeekDay; label: string }[] = [
		{ value: 1, label: 'Monday' },
		{ value: 0, label: 'Sunday' },
		{ value: 6, label: 'Saturday' },
	];

	async function setWeekStart(day: WeekDay) {
		await settings.setWeekStart(day);
	}

	async function moveDatabase() {
		if (busy || !settings.dbPath) return;
		busy = true;
		error = null;
		info = null;
		try {
			const picked = await openDialog({
				directory: true,
				multiple: false,
				title: 'Pick a folder to move the database into'
			});
			if (typeof picked !== 'string') return;
			const name = await basename(settings.dbPath);
			const target = await join(picked, name);
			if (target === settings.dbPath) {
				info = 'Already there.';
				return;
			}
			if (!(await exists(picked))) await mkdir(picked, { recursive: true });
			await db.close();
			await copyFile(settings.dbPath, target);
			await db.open(target);
			await settings.setDbPath(target);
			info = `Moved to ${target}.`;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	async function switchDatabase() {
		if (busy) return;
		const ok = confirm('Switch to a different database? Your current file stays where it is.');
		if (!ok) return;
		busy = true;
		try {
			await db.close();
			await settings.clear();
			await goto('/init', { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<main class="mx-auto max-w-2xl px-6 py-12">
	<header class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="mb-1 text-3xl">Settings</h1>
		</div>
		<a href="/" class="btn-outline">Back</a>
	</header>

	<section class="mb-6 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm">
		<h2 class="mb-3 text-lg">Preferences</h2>
		<div>
			<label class="mb-1 block text-sm font-medium" for="week-start">Week starts on</label>
			<select
				id="week-start"
				class="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm focus:border-[color:var(--color-accent)] focus:outline-none"
				onchange={(e) => setWeekStart(Number((e.target as HTMLSelectElement).value) as WeekDay)}
			>
				{#each WEEKDAY_OPTIONS as opt (opt.value)}
					<option value={opt.value} selected={settings.weekStart === opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
	</section>

	<section class="mb-6 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm">
		<h2 class="mb-3 text-lg">Pomodoro timer</h2>

		<label class="mb-4 flex items-center gap-3">
			<input
				type="checkbox"
				class="size-4 rounded border-[color:var(--color-border)] accent-[color:var(--color-accent)]"
				bind:checked={pomoEnabled}
				onchange={savePomo}
			/>
			<span class="text-sm font-medium">Enable Pomodoro timer while tracking</span>
		</label>

		{#if pomoEnabled}
			<div class="mb-4 grid grid-cols-2 gap-4">
				<div>
					<label class="mb-1 block text-xs font-medium text-[color:var(--color-fg-muted)]" for="pomo-work">Work duration (min)</label>
					<input
						id="pomo-work"
						type="number"
						min="1"
						max="120"
						class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm font-mono focus:border-[color:var(--color-accent)] focus:outline-none"
						bind:value={pomoWork}
						onchange={savePomo}
					/>
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-[color:var(--color-fg-muted)]" for="pomo-short">Short break (min)</label>
					<input
						id="pomo-short"
						type="number"
						min="1"
						max="60"
						class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm font-mono focus:border-[color:var(--color-accent)] focus:outline-none"
						bind:value={pomoShort}
						onchange={savePomo}
					/>
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-[color:var(--color-fg-muted)]" for="pomo-long">Long break (min)</label>
					<input
						id="pomo-long"
						type="number"
						min="1"
						max="60"
						class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm font-mono focus:border-[color:var(--color-accent)] focus:outline-none"
						bind:value={pomoLong}
						onchange={savePomo}
					/>
				</div>
				<div>
					<label class="mb-1 block text-xs font-medium text-[color:var(--color-fg-muted)]" for="pomo-sessions">Sessions before long break</label>
					<input
						id="pomo-sessions"
						type="number"
						min="1"
						max="12"
						class="w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-3 py-2 text-sm font-mono focus:border-[color:var(--color-accent)] focus:outline-none"
						bind:value={pomoSessions}
						onchange={savePomo}
					/>
				</div>
			</div>
			<button
				type="button"
				class="text-sm text-[color:var(--color-fg-muted)] underline decoration-[color:var(--color-border)] underline-offset-2 transition hover:text-[color:var(--color-fg)]"
				onclick={async () => {
					pomoWork = DEFAULT_POMODORO.workMins;
					pomoShort = DEFAULT_POMODORO.shortBreakMins;
					pomoLong = DEFAULT_POMODORO.longBreakMins;
					pomoSessions = DEFAULT_POMODORO.sessionsBeforeLong;
					await savePomo();
					pomoResetMsg = 'Restored defaults';
					setTimeout(() => pomoResetMsg = '', 2000);
				}}
			>
				{pomoResetMsg || 'Reset to defaults'}
			</button>
		{/if}
	</section>

	<section class="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm">
		<h2 class="mb-3 text-lg">Database</h2>
		<p class="selectable mb-4 rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 font-mono text-xs text-[color:var(--color-fg-muted)] break-all">
			{settings.dbPath ?? '(none)'}
		</p>

		{#if info}
			<p class="mb-3 rounded-lg bg-[color:var(--color-accent-soft)] px-3 py-2 text-sm">{info}</p>
		{/if}
		{#if error}
			<p class="mb-3 rounded-lg bg-[color:var(--color-accent-soft)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
				{error}
			</p>
		{/if}

		<div class="flex flex-wrap gap-3">
			<button
				type="button"
				class="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-2 text-sm transition hover:bg-[color:var(--color-surface-2)] disabled:opacity-60"
				onclick={moveDatabase}
				disabled={busy || !settings.dbPath}
			>
				Move to folder…
			</button>
			<button
				type="button"
				class="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-4 py-2 text-sm text-[color:var(--color-danger)] transition hover:bg-[color:var(--color-surface-2)] disabled:opacity-60"
				onclick={switchDatabase}
				disabled={busy}
			>
				Switch database…
			</button>
		</div>
	</section>
</main>
