import assert from 'node:assert/strict';
import test from 'node:test';
import type { App } from 'obsidian';
import type { OperonIndexer } from '../src/indexer/indexer';
import type { TaskWriter } from '../src/core/task-writer';
import type { ActiveTrackerStoreLike } from '../src/storage/active-tracker-store';
import type { ActiveTrackerRecord } from '../src/types/tracker';
import { TimeTracker, type TimeTrackerEvent } from '../src/systems/time-tracker';
import { DEFAULT_SETTINGS } from '../src/types/settings';
import type { IndexedTask } from '../src/types/fields';

function createTask(operonId: string, description: string): IndexedTask {
	return {
		operonId,
		description,
		checkbox: 'open',
		fieldValues: { operonId },
		tags: [],
		primary: { filePath: 'Tasks.md', lineNumber: 0, format: 'inline' },
		datetimeModified: '',
		tier: 'hot',
	} as IndexedTask;
}

function createHarness() {
	const tasks = new Map<string, IndexedTask>();
	const store = { active: null as ActiveTrackerRecord | null };
	const indexer = { getTask: (operonId: string) => tasks.get(operonId) } as unknown as OperonIndexer;
	const activeTrackerStore = {
		getActiveForUser: () => store.active,
	} as unknown as ActiveTrackerStoreLike;
	const tracker = new TimeTracker(
		{} as App,
		indexer,
		{} as TaskWriter,
		activeTrackerStore,
		() => DEFAULT_SETTINGS,
		undefined,
		async () => undefined,
	);
	const events: TimeTrackerEvent[] = [];
	tracker.subscribe(event => { if (event === 'state') events.push(event); });
	return { tasks, store, tracker, events };
}

test('index updates without an active tracker publish state once', async () => {
	const harness = createHarness();
	await harness.tracker.resumeFromIndex();
	await harness.tracker.resumeFromIndex();
	await harness.tracker.resumeFromIndex();
	assert.equal(harness.events.length, 1);
});

test('index updates that leave the tracked task untouched publish no state', async () => {
	const harness = createHarness();
	try {
		harness.tasks.set('task1', createTask('task1', 'Write report'));
		harness.store.active = { id: 'r1', taskId: 'task1', start: '2026-10-08T10:00:00', source: 'command' } as ActiveTrackerRecord;
		await harness.tracker.resumeFromIndex();
		await harness.tracker.resumeFromIndex();
		assert.equal(harness.events.length, 1);

		// Reindexing the tracked task's source replaces its indexed object.
		harness.tasks.set('task1', createTask('task1', 'Write final report'));
		await harness.tracker.resumeFromIndex();
		assert.equal(harness.events.length, 2);

		harness.store.active = null;
		await harness.tracker.resumeFromIndex();
		assert.equal(harness.events.length, 3);
	} finally {
		harness.tracker.destroy();
	}
});
