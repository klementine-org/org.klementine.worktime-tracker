<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { settings } from '$lib/settings.svelte';
	import * as db from '$lib/db.svelte';

	const { children } = $props();

	let booted = $state(false);
	let bootError = $state<string | null>(null);

	onMount(() => {
		(async () => {
			try {
				await settings.load();
				if (!settings.dbPath) {
					if (page.url.pathname !== '/init') await goto('/init', { replaceState: true });
				} else if (!db.isOpen()) {
					await db.open(settings.dbPath);
				}
			} catch (err) {
				bootError = err instanceof Error ? err.message : String(err);
			} finally {
				booted = true;
			}
		})();
	});
</script>

{#if !booted}
	<div class="grid h-screen place-items-center text-[color:var(--color-fg-muted)]">
		<span>Loading…</span>
	</div>
{:else if bootError}
	<div class="grid h-screen place-items-center px-6 text-center">
		<div>
			<h1 class="mb-2 text-2xl">Couldn't start Worktime Tracker</h1>
			<p class="text-[color:var(--color-fg-muted)]">{bootError}</p>
		</div>
	</div>
{:else}
	{@render children()}
{/if}
