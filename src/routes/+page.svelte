<script lang="ts">
	import { onMount } from 'svelte';
	import { tracker } from '$lib/tracker.svelte';
	import * as db from '$lib/db.svelte';
	import type { Entry } from '$lib/db.svelte';
	import { entriesToDailyTotals, vacationDaySet } from '$lib/queries';
	import { localDayKey, localTzName, dateToKey } from '$lib/time';
	import { settings } from '$lib/settings.svelte';
	import Header from '$lib/components/Header.svelte';
	import DayList from '$lib/components/DayList.svelte';
	import Heatmap from '$lib/components/Heatmap.svelte';
	import MonthBars from '$lib/components/MonthBars.svelte';
	import WeekSummary from '$lib/components/WeekSummary.svelte';
	import DayTimeline from '$lib/components/DayTimeline.svelte';
	import ManualEntryDialog from '$lib/components/ManualEntryDialog.svelte';
	import VacationDialog from '$lib/components/VacationDialog.svelte';
	import TreePalm from '@lucide/svelte/icons/tree-palm';
	import PenLine from '@lucide/svelte/icons/pen-line';
	import SettingsIcon from '@lucide/svelte/icons/settings';

	const tz = localTzName();

	let entries = $state<Entry[]>([]);
	let entryPauseTotals = $state<Map<number, number>>(new Map());
	let noteCounts = $state<Map<string, number>>(new Map());
	let vacationDays = $state<Set<string>>(new Set());

	let dailyTotals = $derived.by(() => {
		void tracker.tickNow;
		return entriesToDailyTotals(entries, tz, entryPauseTotals);
	});

	let dailyPauseTotals = $derived.by(() => {
		const map = new Map<string, number>();
		for (const e of entries) {
			const pMs = entryPauseTotals.get(e.id) ?? 0;
			if (pMs <= 0) continue;
			const key = localDayKey(e.started_at, tz);
			const rawMs = Math.max(0, (e.stopped_at ? new Date(e.stopped_at).getTime() : Date.now()) - new Date(e.started_at).getTime());
			map.set(key, (map.get(key) ?? 0) + Math.min(pMs, rawMs));
		}
		return map;
	});

	let manualOpen = $state(false);
	let vacationOpen = $state(false);
	let selectedMonth = $state(getCurrentMonth());
	let selectedYear = $state(new Date().getFullYear());
	let selectedWeekStart = $state(getCurrentWeekStart());
	let selectedDay = $state(getTodayKey());
	let chartTab = $state<'day' | 'week' | 'month' | 'year'>('day');
	const chartTabs = ['day', 'week', 'month', 'year'] as const;
	const chartTabIdx = $derived(chartTabs.indexOf(chartTab));

	function getTodayKey(): string {
		return localDayKey(new Date().toISOString(), tz);
	}

	function shiftDay(delta: number) {
		const d = new Date(selectedDay + 'T12:00:00');
		d.setDate(d.getDate() + delta);
		selectedDay = dateToKey(d);
	}

	function getCurrentMonth(): string {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	}

	function getCurrentWeekStart(): string {
		const now = new Date();
		const dow = now.getDay();
		const diff = (dow - settings.weekStart + 7) % 7;
		const ws = new Date(now);
		ws.setDate(now.getDate() - diff);
		return dateToKey(ws);
	}

	function shiftWeek(delta: number) {
		const d = new Date(selectedWeekStart + 'T00:00:00');
		d.setDate(d.getDate() + delta * 7);
		selectedWeekStart = dateToKey(d);
	}

	function shiftMonth(delta: number) {
		const [y, m] = selectedMonth.split('-').map(Number);
		const d = new Date(y, m - 1 + delta, 1);
		selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	onMount(async () => {
		await tracker.init();
		await loadData();
		await loadVacations();
	});

	let loadVersion = 0;

	async function loadData() {
		const v = ++loadVersion;
		const newEntries = await db.getRecentEntries(500);
		if (v !== loadVersion) return;
		const [newPauseTotals, newNoteCounts] = await Promise.all([
			db.getPauseTotalsByEntries(newEntries.map(e => e.id)),
			db.getNoteCountsByDay(),
		]);
		if (v !== loadVersion) return;
		entries = newEntries;
		entryPauseTotals = newPauseTotals;
		noteCounts = newNoteCounts;
	}

	async function loadVacations() {
		const vacs = await db.getVacations();
		vacationDays = vacationDaySet(vacs);
	}

	$effect(() => {
		const _ = tracker.active;
		loadData();
	});

	function jumpToCurrent() {
		selectedDay = getTodayKey();
		selectedWeekStart = getCurrentWeekStart();
		selectedMonth = getCurrentMonth();
		selectedYear = new Date().getFullYear();
	}

	function handleSelectDay(day: string) {
		selectedDay = day;
		chartTab = 'day';
	}
</script>

<main class="mx-auto max-w-4xl px-6 py-12">
	<div class="mb-10 flex items-center justify-between">
		<div>
			<h1 class="text-4xl">Worktime</h1>
			<p class="mt-1 text-sm text-[color:var(--color-fg-muted)]">
				Local-first time tracking
			</p>
		</div>
		<div class="flex gap-2">
			<button type="button" class="btn-outline" onclick={() => (vacationOpen = true)}>
				<TreePalm size={16} />
				Add vacation
			</button>
			<button type="button" class="btn-outline" onclick={() => (manualOpen = true)}>
				<PenLine size={16} />
				Manual entry
			</button>
			<a
				href="/settings"
				class="grid size-9 place-items-center rounded-lg border border-[color:var(--color-border)] text-[color:var(--color-fg-muted)] transition hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-fg)]"
				title="Settings"
			>
				<SettingsIcon size={18} />
			</a>
		</div>
	</div>

	<Header />

	<section class="mb-8 rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-sm">
		<div class="mb-4 flex items-center justify-between">
			<div class="relative grid grid-cols-4 rounded-lg bg-[color:var(--color-surface-2)] p-0.5">
				<div
					class="absolute top-0.5 bottom-0.5 rounded-md bg-[color:var(--color-bg)] shadow-sm transition-all duration-250 ease-in-out"
					style="left: calc({chartTabIdx} * 25% + 2px); width: calc(25% - 4px);"
				></div>
				{#each chartTabs as tab (tab)}
					<button
						type="button"
						class="relative z-10 rounded-md px-4 py-1.5 text-center text-sm font-medium capitalize transition-colors duration-250 {chartTab === tab ? 'text-[color:var(--color-fg)]' : 'text-[color:var(--color-fg-muted)]'}"
						onclick={() => (chartTab = tab)}
					>
						{tab}
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="rounded-md px-3 py-1.5 text-xs font-medium text-[color:var(--color-fg-muted)] transition hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-fg)]"
				onclick={jumpToCurrent}
			>
				Current
			</button>
		</div>

		<div class="relative overflow-hidden">
			<div
				class="transition-all duration-300 ease-in-out"
				style="clip-path: {chartTab === 'day' ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)'}; {chartTab === 'day' ? '' : 'position: absolute; top: 0; left: 0; right: 0;'}"
			>
				<DayTimeline {entries} dayKey={selectedDay} onPrevDay={() => shiftDay(-1)} onNextDay={() => shiftDay(1)} />
			</div>
			<div
				class="transition-all duration-300 ease-in-out"
				style="clip-path: {chartTab === 'week' ? 'inset(0 0 0 0)' : chartTab === 'day' ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)'}; {chartTab === 'week' ? '' : 'position: absolute; top: 0; left: 0; right: 0;'}"
			>
				<WeekSummary {dailyTotals} {dailyPauseTotals} {vacationDays} weekStart={selectedWeekStart} onPrevWeek={() => shiftWeek(-1)} onNextWeek={() => shiftWeek(1)} />
			</div>
			<div
				class="transition-all duration-300 ease-in-out"
				style="clip-path: {chartTab === 'month' ? 'inset(0 0 0 0)' : chartTabIdx < 2 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)'}; {chartTab === 'month' ? '' : 'position: absolute; top: 0; left: 0; right: 0;'}"
			>
				<MonthBars {dailyTotals} {dailyPauseTotals} {vacationDays} month={selectedMonth} onSelectDay={handleSelectDay} onPrevMonth={() => shiftMonth(-1)} onNextMonth={() => shiftMonth(1)} />
			</div>
			<div
				class="transition-all duration-300 ease-in-out"
				style="clip-path: {chartTab === 'year' ? 'inset(0 0 0 0)' : 'inset(0 0 0 100%)'}; {chartTab === 'year' ? '' : 'position: absolute; top: 0; left: 0; right: 0;'}"
			>
				<Heatmap
					{dailyTotals}
					{vacationDays}
					year={selectedYear}
					onSelectDay={handleSelectDay}
					onSelectMonth={(m) => { selectedMonth = m; chartTab = 'month'; }}
					onPrevYear={() => (selectedYear -= 1)}
					onNextYear={() => (selectedYear += 1)}
				/>
			</div>
		</div>
	</section>

	<section>
		<DayList {entries} pauseTotals={entryPauseTotals} {noteCounts} onUpdated={loadData} />
	</section>
</main>

<ManualEntryDialog bind:open={manualOpen} onSaved={loadData} />
<VacationDialog bind:open={vacationOpen} onSaved={loadVacations} />
