import assert from 'node:assert/strict';
import test from 'node:test';
import type { OperonIndexer } from '../src/indexer/indexer';
import type { TaskWriter } from '../src/core/task-writer';
import { DependencyManager } from '../src/systems/dependency-manager';
import type { IndexedTask } from '../src/types/fields';

function createTask(operonId: string, fieldValues: Record<string, string>): IndexedTask {
	return {
		operonId,
		description: operonId,
		checkbox: 'open',
		fieldValues: { operonId, ...fieldValues },
		tags: [],
		primary: { filePath: `${operonId}.md`, lineNumber: 0, format: 'yaml' },
		datetimeModified: '',
		tier: 'hot',
	} as IndexedTask;
}

function createHarness(tasks: IndexedTask[]) {
	const byId = new Map(tasks.map(task => [task.operonId, task]));
	const writes: Array<{ operonId: string; fields: Record<string, string> }> = [];
	const indexer = {
		getTask: (operonId: string) => byId.get(operonId),
		getAllTasks: () => [...byId.values()],
	} as unknown as OperonIndexer;
	const writer = {
		writeTaskFields: async (operonId: string, fields: Record<string, string>) => {
			writes.push({ operonId, fields });
			return true;
		},
	} as unknown as TaskWriter;
	return { byId, writes, manager: new DependencyManager(indexer, writer) };
}

test('unrepairable dependency edges are validated once per graph state', async () => {
	const harness = createHarness([
		createTask('a', { blocking: 'b' }),
		createTask('b', { blocking: 'a' }),
	]);
	const warnings: unknown[] = [];
	const originalWarn = console.warn;
	console.warn = (...args: unknown[]) => { warnings.push(args); };
	try {
		assert.equal(await harness.manager.reconcileAdditiveInverseLinks(), 0);
		const firstPassWarnings = warnings.length;
		assert.ok(firstPassWarnings > 0);
		assert.equal(await harness.manager.reconcileAdditiveInverseLinks(), 0);
		assert.equal(warnings.length, firstPassWarnings);

		// Breaking the cycle changes the graph; the remaining edge is repaired.
		harness.byId.get('b')!.fieldValues.blocking = '';
		assert.equal(await harness.manager.reconcileAdditiveInverseLinks(), 1);
		assert.deepEqual(harness.writes.map(write => write.operonId), ['b']);
		assert.equal(harness.byId.get('b')!.fieldValues.blockedBy, 'a');
	} finally {
		console.warn = originalWarn;
	}
});
