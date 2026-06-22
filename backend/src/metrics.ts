import { MetricsData } from './types.js';

export class Metrics {
  private totalSearches: number = 0;
  private suggestRequests: number = 0;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private batchFlushes: number = 0;
  private databaseWrites: number = 0;
  private queriesFlushed: number = 0;
  private queryStoreSize: number = 0;
  private searchBufferSize: number = 0;
  private startTime: number = Date.now();

  incrementTotalSearches(): void {
    this.totalSearches++;
  }

  incrementSuggestRequests(): void {
    this.suggestRequests++;
  }

  incrementCacheHits(): void {
    this.cacheHits++;
  }

  incrementCacheMisses(): void {
    this.cacheMisses++;
  }

  recordBatchFlush(): void {
    this.batchFlushes++;
  }

  addDatabaseWrites(n: number): void {
    this.databaseWrites += n;
  }

  addQueriesFlushed(n: number): void {
    this.queriesFlushed += n;
  }

  setQueryStoreSize(size: number): void {
    this.queryStoreSize = size;
  }

  setSearchBufferSize(size: number): void {
    this.searchBufferSize = size;
  }

  getCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total === 0 ? 0 : Math.round((this.cacheHits / total) * 10000) / 100;
  }

  getData(): MetricsData {
    return {
      totalSearches: this.totalSearches,
      suggestRequests: this.suggestRequests,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      cacheHitRate: this.getCacheHitRate(),
      batchFlushes: this.batchFlushes,
      databaseWrites: this.databaseWrites,
      queriesFlushed: this.queriesFlushed,
      queryStoreSize: this.queryStoreSize,
      searchBufferSize: this.searchBufferSize,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }
}
