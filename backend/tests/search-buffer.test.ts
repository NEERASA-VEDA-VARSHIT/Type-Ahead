import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SearchBuffer } from '../src/search-buffer.js';
import { QueryStore } from '../src/query-store.js';
import { CacheManager } from '../src/cache-manager.js';
import { Metrics } from '../src/metrics.js';

describe('SearchBuffer', () => {
  it('batches and normalizes incoming searches', () => {
    const store = new QueryStore(':memory:');
    const metrics = new Metrics();
    const cache = new CacheManager(store, metrics);
    const buffer = new SearchBuffer(store, cache, metrics, 60000);

    buffer.add('  TypeScript  ');
    buffer.add('typescript');
    buffer.add('TYPESCRIPT');
    buffer.add('React');

    assert.equal(buffer.size(), 2); // 'typescript' (count: 3), 'react' (count: 1)
  });

  it('flushes batched queries into QueryStore', async () => {
    const store = new QueryStore(':memory:');
    const metrics = new Metrics();
    const cache = new CacheManager(store, metrics);
    const buffer = new SearchBuffer(store, cache, metrics, 60000);

    buffer.add('graphql');
    buffer.add('graphql');

    // Trigger flush
    await (buffer as any).flush();

    assert.equal(buffer.size(), 0);
    const record = store.get('graphql');
    assert.ok(record);
    assert.equal(record.totalCount, 2);
    assert.equal(record.recentCount, 2);
    assert.equal(metrics.getData().batchFlushes, 1);
  });
});
