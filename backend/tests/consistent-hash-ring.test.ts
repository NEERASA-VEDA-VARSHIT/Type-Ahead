import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConsistentHashRing } from '../src/consistent-hash-ring.js';

describe('ConsistentHashRing', () => {
  it('initializes with specified virtual node count', () => {
    const ring = new ConsistentHashRing(50);
    assert.equal(ring.getNodeVirtualNodeCount(), 50);
    assert.equal(ring.getRingSize(), 0);
    assert.deepEqual(ring.getNodes(), []);
  });

  it('adds nodes and creates virtual ring entries', () => {
    const ring = new ConsistentHashRing(100);
    ring.addNode('redis-1');
    assert.equal(ring.getRingSize(), 100);
    assert.deepEqual(ring.getNodes(), ['redis-1']);

    ring.addNode('redis-2');
    assert.equal(ring.getRingSize(), 200);
    assert.equal(ring.getNodes().length, 2);
  });

  it('does not duplicate entries when adding an existing node', () => {
    const ring = new ConsistentHashRing(50);
    ring.addNode('redis-1');
    ring.addNode('redis-1');
    assert.equal(ring.getRingSize(), 50);
    assert.equal(ring.getNodes().length, 1);
  });

  it('removes nodes and all associated virtual points', () => {
    const ring = new ConsistentHashRing(50);
    ring.addNode('redis-1');
    ring.addNode('redis-2');
    assert.equal(ring.getRingSize(), 100);

    ring.removeNode('redis-1');
    assert.equal(ring.getRingSize(), 50);
    assert.deepEqual(ring.getNodes(), ['redis-2']);
  });

  it('throws an error when querying an empty ring', () => {
    const ring = new ConsistentHashRing(50);
    assert.throws(() => ring.getNode('search_term'), {
      message: 'No nodes available in the hash ring',
    });
  });

  it('deterministically maps keys to nodes', () => {
    const ring = new ConsistentHashRing(100);
    ring.addNode('redis-1');
    ring.addNode('redis-2');
    ring.addNode('redis-3');

    const node1 = ring.getNode('javascript');
    const node2 = ring.getNode('javascript');
    const node3 = ring.getNode('typescript');

    assert.equal(node1, node2);
    assert.ok(['redis-1', 'redis-2', 'redis-3'].includes(node1));
    assert.ok(['redis-1', 'redis-2', 'redis-3'].includes(node3));
  });

  it('distributes keys across multiple nodes without severe hotspotting', () => {
    const ring = new ConsistentHashRing(100);
    const nodes = ['node-a', 'node-b', 'node-c'];
    nodes.forEach(n => ring.addNode(n));

    const distribution: Record<string, number> = { 'node-a': 0, 'node-b': 0, 'node-c': 0 };
    for (let i = 0; i < 300; i++) {
      const assigned = ring.getNode(`query_prefix_${i}`);
      distribution[assigned]++;
    }

    // Every node must receive a significant share (at least 50 out of 300 queries)
    for (const node of nodes) {
      assert.ok(
        distribution[node] >= 50,
        `Node ${node} received only ${distribution[node]} keys (expected >= 50)`
      );
    }
  });
});
