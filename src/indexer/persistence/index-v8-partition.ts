import {
	INDEX_V8_PARTITION_ALGORITHM,
	INDEX_V8_SHARD_COUNT,
	type IndexV8ShardId,
} from './index-v8-contract';

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:\//;

export class IndexV8PathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'IndexV8PathError';
	}
}

// Index passes normalize every task path repeatedly; both helpers are pure.
const PATH_MEMO_LIMIT = 50_000;
const normalizedPathMemo = new Map<string, string>();
const shardIdMemo = new Map<string, IndexV8ShardId>();

function rememberPath<T>(memo: Map<string, T>, key: string, value: T): T {
	if (memo.size >= PATH_MEMO_LIMIT) memo.clear();
	memo.set(key, value);
	return value;
}

export function normalizeIndexV8SourcePath(input: string): string {
	if (typeof input !== 'string' || input.length === 0) {
		throw new IndexV8PathError('Source path must be a non-empty string');
	}
	const memoized = normalizedPathMemo.get(input);
	if (memoized !== undefined) return memoized;
	return rememberPath(normalizedPathMemo, input, validateIndexV8SourcePath(input));
}

function validateIndexV8SourcePath(input: string): string {
	const normalized = input.replace(/\\/g, '/').normalize('NFC');
	if (
		normalized.startsWith('/')
		|| normalized.startsWith('//')
		|| WINDOWS_DRIVE_PATH.test(normalized)
		|| hasControlCharacter(normalized)
	) {
		throw new IndexV8PathError('Source path must be a safe vault-relative path');
	}
	const segments = normalized.split('/');
	if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
		throw new IndexV8PathError('Source path contains an unsafe segment');
	}
	return normalized;
}

function hasControlCharacter(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code <= 0x1f || code === 0x7f) return true;
	}
	return false;
}

export function fnv1a32Utf8Nfc(input: string): number {
	const bytes = new TextEncoder().encode(input.normalize('NFC'));
	let hash = 0x811c9dc5;
	for (const byte of bytes) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

export function getIndexV8ShardId(sourcePath: string): IndexV8ShardId {
	const normalized = normalizeIndexV8SourcePath(sourcePath);
	const memoized = shardIdMemo.get(normalized);
	if (memoized !== undefined) return memoized;
	const shard = fnv1a32Utf8Nfc(normalized) & (INDEX_V8_SHARD_COUNT - 1);
	return rememberPath(shardIdMemo, normalized, shard.toString(16).padStart(2, '0'));
}

export function getAllIndexV8ShardIds(): IndexV8ShardId[] {
	return Array.from(
		{ length: INDEX_V8_SHARD_COUNT },
		(_unused, index) => index.toString(16).padStart(2, '0'),
	);
}

export function isIndexV8PartitionAlgorithm(value: unknown): value is typeof INDEX_V8_PARTITION_ALGORITHM {
	return value === INDEX_V8_PARTITION_ALGORITHM;
}
