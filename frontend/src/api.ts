import { SuggestResponse, TrendingResponse, MetricsData, CacheDebugInfo } from './types';

const BASE = '/api';

export async function fetchSuggestions(
  prefix: string,
  mode: string = 'historical'
): Promise<SuggestResponse> {
  const res = await fetch(`${BASE}/suggest?q=${encodeURIComponent(prefix)}&mode=${mode}`);
  if (!res.ok) throw new Error(`Suggest failed: ${res.statusText}`);
  return res.json();
}

export async function submitSearch(query: string): Promise<void> {
  const res = await fetch(`${BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
}

export async function fetchTrending(mode: string = 'trending'): Promise<TrendingResponse> {
  const res = await fetch(`${BASE}/trending?mode=${mode}`);
  if (!res.ok) throw new Error(`Trending failed: ${res.statusText}`);
  return res.json();
}

export async function fetchMetrics(): Promise<MetricsData> {
  const res = await fetch(`${BASE}/metrics`);
  if (!res.ok) throw new Error(`Metrics failed: ${res.statusText}`);
  return res.json();
}

export async function fetchCacheDebug(prefix: string): Promise<CacheDebugInfo> {
  const res = await fetch(`${BASE}/cache/debug?prefix=${encodeURIComponent(prefix)}`);
  if (!res.ok) throw new Error(`Cache debug failed: ${res.statusText}`);
  return res.json();
}
