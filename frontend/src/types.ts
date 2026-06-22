export interface Suggestion {
  query: string;
  totalCount: number;
  recentCount: number;
  score: number;
}

export interface SuggestResponse {
  suggestions: Suggestion[];
  prefix: string;
  mode: string;
  cacheHit: boolean;
}

export interface TrendingResponse {
  trending: Suggestion[];
  mode: string;
}

export interface MetricsData {
  totalSearches: number;
  suggestRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  batchFlushes: number;
  databaseWrites: number;
  queriesFlushed: number;
  queryStoreSize: number;
  searchBufferSize: number;
  uptime: number;
}

export interface CacheDebugInfo {
  prefix: string;
  node: string;
  cacheHit: boolean;
  hashValue: string;
  virtualNodeCount: number;
  ringSize: number;
  activeNodes: string[];
}
