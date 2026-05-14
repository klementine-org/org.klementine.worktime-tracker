<script lang="ts">
	import { settings } from '$lib/settings.svelte';
	import { dateToKey } from '$lib/time';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { dailyTotals, dailyPauseTotals, weekStart: weekStartDate, vacationDays, onPrevWeek, onNextWeek }: {
		dailyTotals: Map<string, number>;
		dailyPauseTotals?: Map<string, number>;
		weekStart: string;
		vacationDays?: Set<string>;
		onPrevWeek?: () => void;
		onNextWeek?: () => void;
	} = $props();

	const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	const vacationColor = 'var(--color-vacation)';

	function isoWeekNumber(date: Date): number {
		const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNum = d.getUTCDay() || 7;
		d.setUTCDate(d.getUTCDate() + 4 - dayNum);
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
	}

	function weekDayKeys(startDate: string): string[] {
		const start = new Date(startDate + 'T00:00:00');
		const keys: string[] = [];
		for (let i = 0; i < 7; i++) {
			const d = new Date(start);
			d.setDate(start.getDate() + i);
			keys.push(dateToKey(d));
		}
		return keys;
	}

	function weekTotalMs(startDate: string): number {
		return weekDayKeys(startDate).reduce((sum, k) => sum + (dailyTotals.get(k) ?? 0), 0);
	}

	type BarData = { day: string; dayNum: number; weekday: number; hours: number; pauseHours: number; pct: number; pausePct: number; isVacation: boolean; isToday: boolean };

	const todayKey = $derived(dateToKey(new Date()));

	const bars = $derived.by(() => {
		const start = new Date(weekStartDate + 'T00:00:00');
		const result: BarData[] = [];
		let maxHours = 8;

		for (let i = 0; i < 7; i++) {
			const d = new Date(start);
			d.setDate(start.getDate() + i);
			const key = dateToKey(d);
			const ms = dailyTotals.get(key) ?? 0;
			const pauseMs = dailyPauseTotals?.get(key) ?? 0;
			const hours = ms / 3_600_000;
			const pauseHours = pauseMs / 3_600_000;
			if (hours > maxHours) maxHours = hours;
			const weekday = d.getDay();
			const isVacation = vacationDays?.has(key) ?? false;
			const isToday = key === todayKey;
			result.push({ day: key, dayNum: d.getDate(), weekday, hours, pauseHours, pct: 0, pausePct: 0, isVacation, isToday });
		}
		for (const bar of result) {
			bar.pct = maxHours > 0 ? (bar.hours / maxHours) * 100 : 0;
			bar.pausePct = maxHours > 0 ? (bar.pauseHours / maxHours) * 100 : 0;
		}
		return result;
	});

	const cwNumber = $derived(isoWeekNumber(new Date(weekStartDate + 'T00:00:00')));

	const weekLabel = $derived.by(() => {
		const start = new Date(weekStartDate + 'T00:00:00');
		const end = new Date(start);
		end.setDate(start.getDate() + 6);
		const fmt = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' });
		const yearFmt = new Intl.DateTimeFormat([], { year: 'numeric' });
		return `CW ${cwNumber} · ${fmt.format(start)} – ${fmt.format(end)}, ${yearFmt.format(end)}`;
	});

	const totalMs = $derived(bars.reduce((sum, b) => sum + b.hours * 3_600_000, 0));
	const totalHours = $derived(totalMs / 3_600_000);
	const daysWorked = $derived(bars.filter(b => b.hours > 0).length);
	const dailyAvg = $derived(daysWorked > 0 ? totalHours / daysWorked : 0);

	const prevWeekStart = $derived.by(() => {
		const d = new Date(weekStartDate + 'T00:00:00');
		d.setDate(d.getDate() - 7);
		return dateToKey(d);
	});

	const prevWeekMs = $derived(weekTotalMs(prevWeekStart));
	const deltaMs = $derived(totalMs - prevWeekMs);
	const deltaLabel = $derived.by(() => {
		if (prevWeekMs === 0 && totalMs === 0) return null;
		const h = Math.abs(deltaMs) / 3_600_000;
		const sign = deltaMs >= 0 ? '+' : '−';
		return `${sign}${h.toFixed(1)}h`;
	});
</script>

<div>
	<div class="mb-4 flex items-center gap-2">
		<button type="button" class="btn-icon" onclick={onPrevWeek}>
			<ChevronLeft size={16} />
		</button>
		<p class="text-sm font-medium text-[color:var(--color-fg-muted)]">{weekLabel}</p>
		<button type="button" class="btn-icon" onclick={onNextWeek}>
			<ChevronRight size={16} />
		</button>
	</div>

	<div class="grid grid-cols-[1fr_200px] gap-6">
		<!-- Bar chart -->
		<div class="flex items-end gap-2">
			{#each bars as bar (bar.day)}
				<div class="flex flex-1 flex-col items-center gap-1">
					<div class="relative h-20 w-full">
						{#if bar.hours > 0 && !bar.isVacation}
							<span
								class="absolute inset-x-0 text-center font-mono text-[10px] text-[color:var(--color-fg-muted)]"
								style="bottom: {Math.max(bar.pct, 4) + 2}%;"
							>{bar.hours.toFixed(1)}</span>
						{/if}
						{#if bar.isVacation}
							<div
								class="absolute inset-x-0 bottom-0 h-full rounded-md"
								style="background: {vacationColor}; opacity: 0.2;"
							></div>
						{:else}
							{#if bar.pausePct > 0}
								<div
									class="absolute inset-x-0 bottom-0 rounded-md transition-all"
									style="height: {Math.max(bar.pct - bar.pausePct, 3)}%; background: var(--color-accent); opacity: {0.3 + (bar.pct / 100) * 0.7};"
								></div>
								<div
									class="absolute inset-x-0 rounded-md transition-all"
									style="bottom: {bar.pct - bar.pausePct + 3}%; height: {Math.max(bar.pausePct, 2)}%; background: var(--color-fg-muted); opacity: 0.2;"
								></div>
							{:else}
								<div
									class="absolute inset-x-0 bottom-0 rounded-md transition-all"
									style="height: {bar.pct > 0 ? Math.max(bar.pct, 4) : 0}%; background: var(--color-accent); opacity: {bar.hours > 0 ? 0.3 + (bar.pct / 100) * 0.7 : 0.1};"
								></div>
							{/if}
						{/if}
					</div>
					<span class="text-xs {bar.isToday ? 'font-bold text-[color:var(--color-fg)]' : 'text-[color:var(--color-fg-faint)]'}">{bar.dayNum}</span>
					<span class="text-[9px] text-[color:var(--color-fg-faint)]">{WEEKDAY_LABELS[bar.weekday]}</span>
				</div>
			{/each}
		</div>

		<!-- Stats 2x2 -->
		<div class="grid grid-cols-2 grid-rows-2 gap-2">
			<div class="flex flex-col justify-center rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2">
				<p class="text-[10px] uppercase tracking-wider text-[color:var(--color-fg-faint)]">Total</p>
				<p class="font-mono text-base leading-tight">{totalHours.toFixed(1)}<span class="ml-0.5 text-xs text-[color:var(--color-fg-muted)]">h</span></p>
			</div>
			<div class="flex flex-col justify-center rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2">
				<p class="text-[10px] uppercase tracking-wider text-[color:var(--color-fg-faint)]">Daily avg</p>
				<p class="font-mono text-base leading-tight">{dailyAvg.toFixed(1)}<span class="ml-0.5 text-xs text-[color:var(--color-fg-muted)]">h</span></p>
			</div>
			<div class="flex flex-col justify-center rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2">
				<p class="text-[10px] uppercase tracking-wider text-[color:var(--color-fg-faint)]">Days</p>
				<p class="font-mono text-base leading-tight">{daysWorked}<span class="ml-0.5 text-xs text-[color:var(--color-fg-muted)]">/ 7</span></p>
			</div>
			{#if deltaLabel}
				<div class="flex flex-col justify-center rounded-lg px-3 py-2 {deltaMs >= 0 ? 'bg-[color:var(--color-success)]/10' : 'bg-[color:var(--color-danger)]/10'}">
					<p class="text-[10px] uppercase tracking-wider text-[color:var(--color-fg-faint)]">vs last week</p>
					<p class="font-mono text-base leading-tight {deltaMs >= 0 ? 'text-[color:var(--color-success)]' : 'text-[color:var(--color-danger)]'}">{deltaLabel}</p>
				</div>
			{:else}
				<div class="flex flex-col justify-center rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2">
					<p class="text-[10px] uppercase tracking-wider text-[color:var(--color-fg-faint)]">vs last week</p>
					<p class="font-mono text-base leading-tight text-[color:var(--color-fg-muted)]">—</p>
				</div>
			{/if}
		</div>
	</div>
</div>
