import Redis from 'ioredis';
import { ConsistentHashRing } from './consistent-hash-ring.js';
import { QueryStore } from './query-store.js';
import { Suggestion, TrendingMode, CacheDebugInfo } from './types.js';
import { Metrics } from './metrics.js';

export class CacheManager {
  private ring: ConsistentHashRing;
  private redisClients: Map<string, Redis> = new Map();
  private queryStore: QueryStore;
  private metrics: Metrics;
  private ttl: number;

  constructor(queryStore: QueryStore, metrics: Metrics, ttl: number = 300) {
    this.ring = new ConsistentHashRing(100);
    this.queryStore = queryStore;
    this.metrics = metrics;
    this.ttl = ttl;
  }

  addNode(name: string, host: string, port: number): void {
    const client = new Redis({
      host,
      port,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    this.redisClients.set(name, client);
    this.ring.addNode(name);
    console.log(`CacheManager: added Redis node "${name}" at ${host}:${port}`);
  }

  async connectAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [name, client] of this.redisClients) {
      promises.push(
        client.connect().then(() => {
          console.log(`CacheManager: connected to "${name}"`);
        }).catch((err) => {
          console.warn(`CacheManager: failed to connect to "${name}": ${err.message}`);
        })
      );
    }
    await Promise.allSettled(promises);
  }

  getRing(): ConsistentHashRing {
    return this.ring;
  }

  async getSuggestions(prefix: string, mode: TrendingMode = 'historical'): Promise<{ suggestions: Suggestion[]; cacheHit: boolean }> {
    const nodeName = this.ring.getNode(prefix);
    const redis = this.redisClients.get(nodeName);
    if (!redis) {
      return { suggestions: [], cacheHit: false };
    }

    const cacheKey = `suggest:${prefix}:${mode}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        this.metrics.incrementCacheHits();
        return { suggestions: JSON.parse(cached) as Suggestion[], cacheHit: true };
      }
    } catch (err) {
      console.warn(`CacheManager: Redis error on get: ${err}`);
    }

    this.metrics.incrementCacheMisses();

    const suggestions = this.queryStore.getFromPrefix(prefix, mode, 10);

    try {
      await redis!.setex(cacheKey, this.ttl, JSON.stringify(suggestions));
    } catch (err) {
      console.warn(`CacheManager: Redis error on set: ${err}`);
    }

    return { suggestions, cacheHit: false };
  }

  async invalidateQuery(query: string): Promise<void> {
    const prefixes: string[] = [];
    const len = query.length;
    for (let i = 3; i <= len; i++) {
      prefixes.push(query.substring(0, i));
    }
    await Promise.all(prefixes.map(p => this.invalidatePrefix(p)));
  }

  private async invalidatePrefix(prefix: string): Promise<void> {
    try {
      const nodeName = this.ring.getNode(prefix);
      const redis = this.redisClients.get(nodeName);
      if (!redis) return;
      await redis.del(`suggest:${prefix}:historical`);
      await redis.del(`suggest:${prefix}:trending`);
    } catch (err) {
      console.warn(`CacheManager: Redis error on invalidate: ${err}`);
    }
  }

  async getCacheDebug(prefix: string): Promise<CacheDebugInfo> {
    const normalized = prefix.toLowerCase().trim();
    const nodeName = this.ring.getNode(normalized);
    const hashValue = ConsistentHashRing.hashKey(normalized);
    const redis = this.redisClients.get(nodeName);
    let cacheHit = false;
    if (redis) {
      try {
        const exists = await redis.exists(`suggest:${normalized}:historical`);
        cacheHit = exists === 1;
      } catch {
        cacheHit = false;
      }
    }
    return {
      prefix: normalized,
      node: nodeName,
      cacheHit,
      hashValue: hashValue.toString(),
      virtualNodeCount: this.ring.getNodeVirtualNodeCount(),
      ringSize: this.ring.getRingSize(),
      activeNodes: this.ring.getNodes(),
    };
  }

  async disconnectAll(): Promise<void> {
    const promises: Promise<unknown>[] = [];
    for (const client of this.redisClients.values()) {
      promises.push(client.quit().catch(() => {}));
    }
    await Promise.allSettled(promises);
  }
}
