import { QueryStore } from './query-store.js';
import { CacheManager } from './cache-manager.js';
import { Metrics } from './metrics.js';

export class SearchBuffer {
  private buffer: Map<string, number> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushInterval: number;
  private queryStore: QueryStore;
  private cacheManager: CacheManager;
  private metrics: Metrics;

  constructor(
    queryStore: QueryStore,
    cacheManager: CacheManager,
    metrics: Metrics,
    flushInterval: number = 10000,
  ) {
    this.queryStore = queryStore;
    this.cacheManager = cacheManager;
    this.metrics = metrics;
    this.flushInterval = flushInterval;
  }

  add(query: string): void {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return;
    this.buffer.set(normalized, (this.buffer.get(normalized) || 0) + 1);
  }

  start(): void {
    this.timer = setInterval(() => this.flush(), this.flushInterval);
    console.log(`SearchBuffer: started, flush interval ${this.flushInterval}ms`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  size(): number {
    return this.buffer.size;
  }

  private async flush(): Promise<void> {
    if (this.buffer.size === 0) return;

    const snapshot = new Map(this.buffer);
    this.buffer.clear();

    const aggregateMap = new Map<string, number>();
    for (const [query, count] of snapshot) {
      aggregateMap.set(query, (aggregateMap.get(query) || 0) + count);
    }

    const totalQueries = Array.from(aggregateMap.values()).reduce((a, b) => a + b, 0);

    this.metrics.recordBatchFlush();
    this.metrics.addDatabaseWrites(aggregateMap.size);
    this.metrics.addQueriesFlushed(totalQueries);

    this.queryStore.updateCounts(aggregateMap);

    const queries = Array.from(aggregateMap.keys());
    await Promise.all(queries.map(q => this.cacheManager.invalidateQuery(q)));

    console.log(
      `[Flush] queries flushed: ${totalQueries}, database writes saved: ${totalQueries - aggregateMap.size}`
    );
  }
}
