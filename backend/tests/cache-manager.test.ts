import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CacheManager } from '../src/cache-manager.js';
import { QueryStore } from '../src/query-store.js';
import { Metrics } from '../src/metrics.js';
import { Suggestion } from '../src/types.js';

class MockQueryStore {
  public records: Map<string, Suggestion[]> = new Map();

  getFromPrefix(prefix: string, mode: string, limit: number = 10): Suggestion[] {
    const data = this.records.get(prefix) || [];
    return data.slice(0, limit);
  }
}

class MockRedisClient {
  public store = new Map<string, string>();
  public shouldFailGet = false;
  public shouldFailSet = false;
  public isConnected = true;

  async get(key: string): Promise<string | null> {
    if (this.shouldFailGet || !this.isConnected) {
      throw new Error('Connection refused / ECONNREFUSED');
    }
    return this.store.get(key) || null;
  }

  async setex(key: string, ttl: number, value: string): Promise<string> {
    if (this.shouldFailSet || !this.isConnected) {
      throw new Error('Connection refused / ECONNREFUSED');
    }
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async quit(): Promise<void> {
    this.isConnected = false;
  }
}

describe('CacheManager', () => {
  let mockStore: MockQueryStore;
  let metrics: Metrics;
  let cacheManager: CacheManager;
  let mockRedis: MockRedisClient;

  beforeEach(() => {
    mockStore = new MockQueryStore();
    metrics = new Metrics();
    cacheManager = new CacheManager(mockStore as unknown as QueryStore, metrics, 300);
    mockRedis = new MockRedisClient();
  });

  it('falls back to origin QueryStore when hash ring has no nodes', async () => {
    mockStore.records.set('rea', [
      { query: 'react', totalCount: 100, recentCount: 20, score: 100 },
    ]);

    const result = await cacheManager.getSuggestions('rea', 'historical');
    assert.equal(result.cacheHit, false);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].query, 'react');
    assert.equal(metrics.getData().cacheMisses, 1);
  });

  it('populates cache on miss and serves from cache on hit', async () => {
    mockStore.records.set('typ', [
      { query: 'typescript', totalCount: 200, recentCount: 40, score: 200 },
    ]);
    cacheManager.addMockClient('redis-node-1', mockRedis);

    // Call 1: Miss
    const res1 = await cacheManager.getSuggestions('typ', 'historical');
    assert.equal(res1.cacheHit, false);
    assert.equal(res1.suggestions[0].query, 'typescript');
    assert.equal(metrics.getData().cacheMisses, 1);
    assert.equal(metrics.getData().cacheHits, 0);

    // Call 2: Hit
    const res2 = await cacheManager.getSuggestions('typ', 'historical');
    assert.equal(res2.cacheHit, true);
    assert.equal(res2.suggestions[0].query, 'typescript');
    assert.equal(metrics.getData().cacheHits, 1);
  });

  it('gracefully degrades to origin when Redis throws on GET', async () => {
    mockStore.records.set('nod', [
      { query: 'nodejs', totalCount: 150, recentCount: 10, score: 150 },
    ]);
    cacheManager.addMockClient('redis-node-1', mockRedis);

    // Simulate failure
    mockRedis.shouldFailGet = true;

    const result = await cacheManager.getSuggestions('nod', 'historical');
    assert.equal(result.cacheHit, false);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].query, 'nodejs');
  });

  it('gracefully returns suggestions even when Redis SET fails', async () => {
    mockStore.records.set('pyt', [
      { query: 'python', totalCount: 300, recentCount: 50, score: 300 },
    ]);
    cacheManager.addMockClient('redis-node-1', mockRedis);

    // Simulate set failure
    mockRedis.shouldFailSet = true;

    const result = await cacheManager.getSuggestions('pyt', 'historical');
    assert.equal(result.cacheHit, false);
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].query, 'python');
  });

  it('invalidates all prefix combinations >= 3 chars upon query mutation', async () => {
    cacheManager.addMockClient('redis-node-1', mockRedis);

    mockRedis.store.set('suggest:fast:historical', JSON.stringify([{ query: 'fastify', score: 10 }]));
    mockRedis.store.set('suggest:fasti:historical', JSON.stringify([{ query: 'fastify', score: 10 }]));
    mockRedis.store.set('suggest:fastify:historical', JSON.stringify([{ query: 'fastify', score: 10 }]));

    await cacheManager.invalidateQuery('fastify');

    assert.equal(mockRedis.store.has('suggest:fast:historical'), false);
    assert.equal(mockRedis.store.has('suggest:fasti:historical'), false);
    assert.equal(mockRedis.store.has('suggest:fastify:historical'), false);
  });
});
