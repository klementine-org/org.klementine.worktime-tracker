import { Store } from '@tauri-apps/plugin-store';

const STORE_FILE = 'settings.json';
const KEY_DB_PATH = 'dbPath';
const KEY_FIRST_RUN_DONE = 'firstRunDone';
const KEY_WEEK_START = 'weekStart';
const KEY_POMODORO = 'pomodoro';

export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun, 1=Mon, ..., 6=Sat

export type PomodoroSettings = {
	enabled: boolean;
	workMins: number;
	shortBreakMins: number;
	longBreakMins: number;
	sessionsBeforeLong: number;
};

const DEFAULT_POMODORO: PomodoroSettings = {
	enabled: false,
	workMins: 25,
	shortBreakMins: 5,
	longBreakMins: 15,
	sessionsBeforeLong: 4,
};

type SettingsState = {
	loaded: boolean;
	dbPath: string | null;
	firstRunDone: boolean;
	weekStart: WeekDay;
	pomodoro: PomodoroSettings;
};

const state = $state<SettingsState>({
	loaded: false,
	dbPath: null,
	firstRunDone: false,
	weekStart: 1,
	pomodoro: { ...DEFAULT_POMODORO }
});

let _store: Store | null = null;

async function getStore(): Promise<Store> {
	if (_store) return _store;
	_store = await Store.load(STORE_FILE);
	return _store;
}

export const settings = {
	get loaded() {
		return state.loaded;
	},
	get dbPath() {
		return state.dbPath;
	},
	get firstRunDone() {
		return state.firstRunDone;
	},
	get weekStart() {
		return state.weekStart;
	},
	get pomodoro() {
		return state.pomodoro;
	},
	async load(): Promise<void> {
		const store = await getStore();
		const dbPath = (await store.get<string>(KEY_DB_PATH)) ?? null;
		const firstRunDone = (await store.get<boolean>(KEY_FIRST_RUN_DONE)) ?? false;
		const weekStart = (await store.get<WeekDay>(KEY_WEEK_START)) ?? 1;
		const pomodoro = (await store.get<PomodoroSettings>(KEY_POMODORO)) ?? { ...DEFAULT_POMODORO };
		state.dbPath = dbPath;
		state.firstRunDone = firstRunDone;
		state.weekStart = weekStart;
		state.pomodoro = pomodoro;
		state.loaded = true;
	},
	async setDbPath(path: string): Promise<void> {
		const store = await getStore();
		await store.set(KEY_DB_PATH, path);
		await store.set(KEY_FIRST_RUN_DONE, true);
		await store.save();
		state.dbPath = path;
		state.firstRunDone = true;
	},
	async setWeekStart(day: WeekDay): Promise<void> {
		const store = await getStore();
		await store.set(KEY_WEEK_START, day);
		await store.save();
		state.weekStart = day;
	},
	async setPomodoro(pomo: PomodoroSettings): Promise<void> {
		const store = await getStore();
		await store.set(KEY_POMODORO, pomo);
		await store.save();
		state.pomodoro = pomo;
	},
	async clear(): Promise<void> {
		const store = await getStore();
		await store.delete(KEY_DB_PATH);
		await store.set(KEY_FIRST_RUN_DONE, false);
		await store.save();
		state.dbPath = null;
		state.firstRunDone = false;
	}
};
