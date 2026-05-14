<script lang="ts">
	import { settings, type WeekDay } from '$lib/settings.svelte';
	import { dateToKey } from '$lib/time';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { dailyTotals, dailyPauseTotals, month, vacationDays, onSelectDay, onPrevMonth, onNextMonth }: {
		dailyTotals: Map<string, number>;
		dailyPauseTotals?: Map<string, number>;
		month: string; // YYYY-MM
		vacationDays?: Set<string>;
		onSelectDay?: (day: string) => void;
		onPrevMonth?: () => void;
		onNextMonth?: () => void;
	} = $props();

	const BAR_MAX_H = 100;
	const BAR_W = 22;
	const GAP = 4;
	const WEEK_GAP = 12;
	const PADDING_BOTTOM = 34;
	const PADDING_TOP = 16;

	const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	const vacationColor = 'var(--color-vacation)';

	type BarData = { day: string; dayNum: number; weekday: number; hours: number; pauseHours: number; height: number; pauseHeight: number; x: number; isWeekStart: boolean; isVacation: boolean };

	const bars = $derived.by(() => {
		const [year, mon] = month.split('-').map(Number);
		const daysInMonth = new Date(year, mon, 0).getDate();
		const weekStart: WeekDay = settings.weekStart;
		const result: BarData[] = [];
		let maxHours = 8;
		let x = 0;

		for (let d = 1; d <= daysInMonth; d++) {
			const key = dateToKey(new Date(year, mon - 1, d));
			const ms = dailyTotals.get(key) ?? 0;
			const pauseMs = dailyPauseTotals?.get(key) ?? 0;
			const hours = ms / 3_600_000;
			const pauseHours = pauseMs / 3_600_000;
			if (hours > maxHours) maxHours = hours;
			const weekday = new Date(year, mon - 1, d).getDay();
			const isWeekStart = weekday === weekStart && d > 1;
			const isVacation = vacationDays?.has(key) ?? false;

			if (isWeekStart) x += WEEK_GAP;
			result.push({ day: key, dayNum: d, weekday, hours, pauseHours, height: 0, pauseHeight: 0, x, isWeekStart, isVacation });
			x += BAR_W + GAP;
		}
		for (const bar of result) {
			bar.height = maxHours > 0 ? (bar.hours / maxHours) * BAR_MAX_H : 0;
			bar.pauseHeight = maxHours > 0 ? (bar.pauseHours / maxHours) * BAR_MAX_H : 0;
		}
		return result;
	});

	const svgWidth = $derived(bars.length > 0 ? bars[bars.length - 1].x + BAR_W : 0);
	const svgHeight = BAR_MAX_H + PADDING_BOTTOM + PADDING_TOP;

	const weekSeparators = $derived(bars.filter(b => b.isWeekStart).map(b => b.x - WEEK_GAP / 2));

	const monthLabel = $derived(
		new Intl.DateTimeFormat([], { year: 'numeric', month: 'long' }).format(
			new Date(month + '-15')
		)
	);
</script>

<div>
	<div class="mb-2 flex items-center gap-2">
		<button type="button" class="btn-icon" onclick={onPrevMonth}>
			<ChevronLeft size={16} />
		</button>
		<p class="text-sm font-medium text-[color:var(--color-fg-muted)]">{monthLabel}</p>
		<button type="button" class="btn-icon" onclick={onNextMonth}>
			<ChevronRight size={16} />
		</button>
	</div>
	<div class="overflow-x-auto">
		<svg width={svgWidth} height={svgHeight} class="block">
			{#each weekSeparators as sx (sx)}
				<line
					x1={sx}
					y1={PADDING_TOP - 4}
					x2={sx}
					y2={PADDING_TOP + BAR_MAX_H + 4}
					stroke="var(--color-border)"
					stroke-width="1"
					stroke-dasharray="3,3"
				/>
			{/each}
			{#each bars as bar (bar.day)}
				<g class="cursor-pointer" role="button" tabindex={0} onclick={() => onSelectDay?.(bar.day)} onkeydown={(e) => { if (e.key === 'Enter') onSelectDay?.(bar.day); }}>
					{#if bar.isVacation}
						<rect
							x={bar.x}
							y={PADDING_TOP}
							width={BAR_W}
							height={BAR_MAX_H}
							rx={4}
							fill={vacationColor}
							opacity={0.2}
							class="transition-opacity hover:opacity-30"
						/>
						<g transform="translate({bar.x + BAR_W / 2 - 7}, {PADDING_TOP + BAR_MAX_H / 2 - 7}) scale(0.583)">
							<g fill="none" stroke={vacationColor} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4" />
								<path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3" />
								<path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35" />
								<path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14" />
							</g>
						</g>
					{:else}
						{#if bar.pauseHeight > 0}
							<rect
								x={bar.x}
								y={PADDING_TOP + BAR_MAX_H - (bar.height - bar.pauseHeight)}
								width={BAR_W}
								height={Math.max(bar.height - bar.pauseHeight, 3)}
								rx={4}
								fill="var(--color-accent)"
								class="transition-opacity hover:opacity-80"
							/>
							<rect
								x={bar.x}
								y={PADDING_TOP + BAR_MAX_H - bar.height - 3}
								width={BAR_W}
								height={Math.max(bar.pauseHeight, 2)}
								rx={4}
								fill="var(--color-fg-muted)"
								opacity={0.2}
								class="pointer-events-none"
							/>
						{:else}
							<rect
								x={bar.x}
								y={PADDING_TOP + BAR_MAX_H - bar.height}
								width={BAR_W}
								height={Math.max(bar.height, bar.hours > 0 ? 3 : 0)}
								rx={4}
								fill={bar.hours > 0 ? 'var(--color-accent)' : 'var(--color-surface-2)'}
								class="transition-opacity hover:opacity-80"
							/>
						{/if}
					{/if}
					{#if bar.hours > 0 && !bar.isVacation}
						<text
							x={bar.x + BAR_W / 2}
							y={PADDING_TOP + BAR_MAX_H - bar.height - 4}
							text-anchor="middle"
							class="fill-[color:var(--color-fg-muted)] text-[9px]"
						>
							{bar.hours.toFixed(1)}
						</text>
					{/if}
					<text
						x={bar.x + BAR_W / 2}
						y={PADDING_TOP + BAR_MAX_H + 14}
						text-anchor="middle"
						class="fill-[color:var(--color-fg-faint)] text-[10px]"
					>
						{bar.dayNum}
					</text>
					<text
						x={bar.x + BAR_W / 2}
						y={PADDING_TOP + BAR_MAX_H + 26}
						text-anchor="middle"
						class="text-[9px] {bar.isWeekStart ? 'fill-[color:var(--color-fg)] font-bold' : 'fill-[color:var(--color-fg-faint)]'}"
					>
						{WEEKDAY_LABELS[bar.weekday]}
					</text>
				</g>
			{/each}
		</svg>
	</div>
</div>
