<script lang="ts">
	import { dateToKey } from '$lib/time';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { dailyTotals, vacationDays, year, onSelectDay, onSelectMonth, onPrevYear, onNextYear }: {
		dailyTotals: Map<string, number>;
		vacationDays?: Set<string>;
		year: number;
		onSelectDay?: (day: string) => void;
		onSelectMonth?: (month: string) => void;
		onPrevYear?: () => void;
		onNextYear?: () => void;
	} = $props();

	const CELL = 13;
	const GAP = 3;
	const ROWS = 7;
	const COLS = 53;
	const PADDING_LEFT = 28;
	const PADDING_TOP = 20;

	function intensityLevel(ms: number): number {
		const hours = ms / 3_600_000;
		if (hours <= 0) return 0;
		if (hours < 2) return 1;
		if (hours < 4) return 2;
		if (hours < 6) return 3;
		return 4;
	}

	const levelColors = [
		'var(--color-surface-2)',
		'var(--color-heat-1)',
		'var(--color-heat-2)',
		'var(--color-heat-3)',
		'var(--color-heat-4)'
	];

	const vacationColor = 'var(--color-vacation)';

	type CellData = { x: number; y: number; day: string; level: number; hours: string; isVacation: boolean };

	const endDate = $derived(new Date(year, 11, 31));

	const cells = $derived.by(() => {
		const result: CellData[] = [];
		const end = endDate;
		const endDow = end.getDay();
		const startOffset = (COLS - 1) * 7 + endDow;
		for (let i = 0; i <= startOffset; i++) {
			const d = new Date(end);
			d.setDate(end.getDate() - (startOffset - i));
			const key = dateToKey(d);
			const col = Math.floor(i / 7);
			const row = i % 7;
			const ms = dailyTotals.get(key) ?? 0;
			const level = intensityLevel(ms);
			const hours = (ms / 3_600_000).toFixed(1);
			const isVacation = vacationDays?.has(key) ?? false;
			result.push({
				x: PADDING_LEFT + col * (CELL + GAP),
				y: PADDING_TOP + row * (CELL + GAP),
				day: key,
				level,
				hours,
				isVacation
			});
		}
		return result;
	});

	const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];
	const monthLabels = $derived.by(() => {
		const labels: { text: string; x: number; month: string }[] = [];
		const end = endDate;
		const endDow = end.getDay();
		const startOffset = (COLS - 1) * 7 + endDow;
		let lastMonth = -1;
		for (let col = 0; col < COLS; col++) {
			const i = col * 7;
			if (i > startOffset) break;
			const d = new Date(end);
			d.setDate(end.getDate() - (startOffset - i));
			if (d.getFullYear() < year) continue;
			if (d.getMonth() !== lastMonth) {
				lastMonth = d.getMonth();
				const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
				labels.push({
					text: d.toLocaleDateString([], { month: 'short' }),
					x: PADDING_LEFT + col * (CELL + GAP),
					month: monthKey
				});
			}
		}
		return labels;
	});

	const svgWidth = PADDING_LEFT + COLS * (CELL + GAP);
	const svgHeight = PADDING_TOP + ROWS * (CELL + GAP);

	let tooltip = $state<{ text: string; x: number; y: number } | null>(null);
</script>

<div>
	<div class="mb-2 flex items-center gap-2">
		<button type="button" class="btn-icon" onclick={onPrevYear}>
			<ChevronLeft size={16} />
		</button>
		<p class="text-sm font-medium text-[color:var(--color-fg-muted)]">{year}</p>
		<button type="button" class="btn-icon" onclick={onNextYear}>
			<ChevronRight size={16} />
		</button>
	</div>
	<div class="overflow-x-auto">
		<svg
			width={svgWidth}
			height={svgHeight}
			class="block"
			role="img"
			aria-label="Work hours heatmap for {year}"
		>
			{#each monthLabels as ml}
				<text
					x={ml.x}
					y={12}
					class="cursor-pointer fill-[color:var(--color-fg-faint)] text-[10px] hover:fill-[color:var(--color-accent)]"
					role="button"
					tabindex={0}
					onclick={() => onSelectMonth?.(ml.month)}
					onkeydown={(e) => { if (e.key === 'Enter') onSelectMonth?.(ml.month); }}
				>{ml.text}</text>
			{/each}
			{#each dayLabels as label, i}
				{#if label}
					<text x={0} y={PADDING_TOP + i * (CELL + GAP) + CELL - 2} class="fill-[color:var(--color-fg-faint)] text-[10px]">{label}</text>
				{/if}
			{/each}
			{#each cells as cell (cell.day)}
				<rect
					x={cell.x}
					y={cell.y}
					width={CELL}
					height={CELL}
					rx={3}
					fill={cell.isVacation ? vacationColor : levelColors[cell.level]}
					class="cursor-pointer transition-opacity hover:opacity-80"
					tabindex={0}
					onclick={() => onSelectDay?.(cell.day)}
					onkeydown={(e) => { if (e.key === 'Enter') onSelectDay?.(cell.day); }}
					onmouseenter={() => {
						tooltip = {
							text: cell.isVacation ? `${cell.day}: vacation` : `${cell.day}: ${cell.hours}h`,
							x: cell.x, y: cell.y - 10
						};
					}}
					onmouseleave={() => (tooltip = null)}
					role="gridcell"
					aria-label="{cell.day}: {cell.hours} hours"
				/>
			{/each}
			{#if tooltip}
				<g>
					<rect
						x={tooltip.x - 4}
						y={tooltip.y - 14}
						width={tooltip.text.length * 6.5 + 8}
						height={18}
						rx={4}
						fill="var(--color-fg)"
						opacity={0.9}
					/>
					<text x={tooltip.x} y={tooltip.y - 1} fill="var(--color-bg)" class="text-[11px]">{tooltip.text}</text>
				</g>
			{/if}
		</svg>
	</div>
</div>
