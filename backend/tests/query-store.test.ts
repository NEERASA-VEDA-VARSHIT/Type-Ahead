import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryStore } from '../src/query-store.js';

describe('QueryStore', () => {
  it('creates in-memory database and indexes prefixes correctly', () => {
    const store = new QueryStore(':memory:');
    store.updateCounts(new Map([
      ['docker', 10],
      ['docker-compose', 25],
      ['doc', 5],
    ]));

    // Prefix 'doc'
    const docSuggestions = store.getFromPrefix('doc', 'historical', 10);
    assert.equal(docSuggestions.length, 3);
    assert.equal(docSuggestions[0].query, 'docker-compose'); // 25
    assert.equal(docSuggestions[1].query, 'docker');         // 10
    assert.equal(docSuggestions[2].query, 'doc');            // 5
  });

  it('weights recent counts higher in trending mode', () => {
    const store = new QueryStore(':memory:');
    store.updateCounts(new Map([
      ['kubernetes', 100],
      ['kubeflow', 40],
    ]));

    const kflow = store.get('kubeflow')!;
    kflow.recentCount = 20;

    const k8s = store.get('kubernetes')!;
    k8s.recentCount = 1;

    // Historical mode: kubernetes wins (100 vs 40)
    const historical = store.getFromPrefix('kube', 'historical', 10);
    assert.equal(historical[0].query, 'kubernetes');

    // Trending mode: kubeflow wins (40 + 20*5 = 140 vs 100 + 1*5 = 105)
    const trending = store.getFromPrefix('kube', 'trending', 10);
    assert.equal(trending[0].query, 'kubeflow');
    assert.equal(trending[0].score, 140);
  });

  it('returns empty array when prefix has no matches', () => {
    const store = new QueryStore(':memory:');
    store.updateCounts(new Map([['golang', 50]]));
    const result = store.getFromPrefix('rust', 'historical', 10);
    assert.deepEqual(result, []);
  });

  it('respects the limit parameter', () => {
    const store = new QueryStore(':memory:');
    const entries = new Map<string, number>();
    for (let i = 1; i <= 20; i++) {
      entries.set(`prefix_term_${i}`, i);
    }
    store.updateCounts(entries);
    const limited = store.getFromPrefix('prefix', 'historical', 5);
    assert.equal(limited.length, 5);
    assert.equal(limited[0].query, 'prefix_term_20');
  });
});
