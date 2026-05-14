<script lang="ts">
	import { tracker } from '$lib/tracker.svelte';
	import { settings } from '$lib/settings.svelte';
	import { formatDuration } from '$lib/time';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import Square from '@lucide/svelte/icons/square';
	import SkipForward from '@lucide/svelte/icons/skip-forward';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Timer from '@lucide/svelte/icons/timer';

	const pomoActive = $derived(settings.pomodoro.enabled && !!tracker.active);
	const pomoProgress = $derived(
		tracker.pomoTotalMs > 0 ? 1 - tracker.pomoRemainingMs / tracker.pomoTotalMs : 0
	);
	const pomoPct = $derived(
		tracker.pomoTotalMs > 0 ? Math.round((1 - tracker.pomoRemainingMs / tracker.pomoTotalMs) * 100) : 0
	);
	const pomoPhaseLabel = $derived.by(() => {
		const phase = tracker.pomoPhase;
		if (phase === 'work') return 'Focus';
		if (phase === 'short-break') return 'Short break';
		return 'Long break';
	});
	const isBreak = $derived(tracker.pomoPhase !== 'work');

	const CIRCLE_R = 34;
	const CIRCLE_C = 2 * Math.PI * CIRCLE_R;
</script>

<header class="mb-8 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-sm">
	{#if tracker.active && pomoActive}
		<div class="relative flex items-center gap-5">
			<div class="relative -my-3 grid size-20 shrink-0 place-items-center">
				<svg class="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
					<circle
						cx="40" cy="40" r={CIRCLE_R}
						fill="none"
						stroke="var(--color-border)"
						stroke-width="5"
						opacity="0.5"
					/>
					<circle
						cx="40" cy="40" r={CIRCLE_R}
						fill="none"
						stroke={isBreak ? 'var(--color-success)' : 'var(--color-accent)'}
						stroke-width="5"
						stroke-linecap="round"
						stroke-dasharray={CIRCLE_C}
						stroke-dashoffset={CIRCLE_C * (1 - pomoProgress) * -1}
						class="transition-[stroke-dashoffset] duration-1000 ease-linear"
					/>
				</svg>
				<span class="font-mono text-lg tracking-tight">{pomoPct}%</span>
			</div>

			<div class="flex-1 min-w-0">
				<div class="flex items-baseline gap-2">
					<span class="text-sm font-medium {isBreak ? 'text-[color:var(--color-success)]' : 'text-[color:var(--color-accent)]'}">
						{pomoPhaseLabel}
					</span>
					<span class="text-[11px] text-[color:var(--color-fg-faint)]">
						{tracker.pomoCompletedSessions + (tracker.pomoPhase === 'work' ? 1 : 0)}/{settings.pomodoro.sessionsBeforeLong}
					</span>
				</div>
				<p class="font-mono text-3xl tracking-tight">
					{formatDuration(tracker.elapsedMs)}
				</p>
			</div>

			<div class="flex items-center gap-1.5">
				<button
					type="button"
					class="grid size-9 place-items-center rounded-full text-[color:var(--color-fg-muted)] transition hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-fg)]"
					onclick={() => tracker.pomoResetPhase()}
					title="Reset timer"
				>
					<RotateCcw size={16} />
				</button>
				<button
					type="button"
					class="grid size-9 place-items-center rounded-full text-[color:var(--color-fg-muted)] transition hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-fg)]"
					onclick={() => isBreak ? tracker.pomoSkipBreak() : tracker.togglePause()}
					title={isBreak ? 'Skip break' : tracker.paused ? 'Resume' : 'Pause'}
				>
					{#if isBreak}
						<SkipForward size={16} />
					{:else if tracker.paused}
						<Play size={16} />
					{:else}
						<Pause size={16} />
					{/if}
				</button>
				<button
					type="button"
					class="grid size-9 place-items-center rounded-full bg-[color:var(--color-danger)]/10 text-[color:var(--color-danger)] transition hover:bg-[color:var(--color-danger)]/20"
					onclick={() => tracker.stop()}
					title="Stop"
				>
					<Square size={14} />
				</button>
			</div>
		</div>
	{:else if tracker.active}
		<div class="flex flex-wrap items-center gap-4">
			<div class="flex-1">
				<p class="text-sm text-[color:var(--color-fg-muted)]">
					{tracker.paused ? 'Paused' : 'Tracking'}
				</p>
				<p class="mt-0.5 font-mono text-3xl tracking-tight">
					{formatDuration(tracker.elapsedMs)}
				</p>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="grid size-10 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] transition hover:bg-[color:var(--color-surface-2)]"
					onclick={() => tracker.togglePause()}
					title={tracker.paused ? 'Resume' : 'Pause'}
				>
					{#if tracker.paused}
						<Play size={18} />
					{:else}
						<Pause size={18} />
					{/if}
				</button>
				<button
					type="button"
					class="grid size-10 place-items-center rounded-lg bg-[color:var(--color-danger)] text-white transition hover:opacity-90"
					onclick={() => tracker.stop()}
					title="Stop"
				>
					<Square size={18} />
				</button>
			</div>
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-4">
			<div class="flex-1">
				<p class="text-sm text-[color:var(--color-fg-muted)]">Ready to track</p>
			</div>
			<button
				type="button"
				class="grid size-10 place-items-center rounded-lg bg-[color:var(--color-success)] text-white transition hover:bg-[color:var(--color-success-hover)]"
				onclick={() => tracker.start()}
				title="Start"
			>
				<Play size={18} />
			</button>
		</div>
	{/if}
</header>
