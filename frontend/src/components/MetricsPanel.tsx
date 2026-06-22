import { useState, useEffect } from 'react';
import { MetricsData } from '../types';
import { fetchMetrics } from '../api';

export default function MetricsPanel() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await fetchMetrics();
      setMetrics(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800">System Metrics</h2>
        <button
          onClick={load}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {metrics && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <MetricItem label="Searches" value={metrics.totalSearches.toLocaleString()} />
            <MetricItem label="Suggest Reqs" value={metrics.suggestRequests.toLocaleString()} />
            <MetricItem label="Cache Hits" value={metrics.cacheHits.toLocaleString()} />
            <MetricItem label="Cache Misses" value={metrics.cacheMisses.toLocaleString()} />
            <MetricItem label="Hit Rate" value={`${metrics.cacheHitRate}%`} />
            <MetricItem label="Flushes" value={metrics.batchFlushes.toLocaleString()} />
            <MetricItem label="DB Writes" value={metrics.databaseWrites.toLocaleString()} />
            <MetricItem label="Flushed Q" value={metrics.queriesFlushed.toLocaleString()} />
            <MetricItem label="Query Store" value={metrics.queryStoreSize.toLocaleString()} />
            <MetricItem label="Buffer Size" value={metrics.searchBufferSize.toLocaleString()} />
            <MetricItem label="Uptime" value={`${metrics.uptime}s`} />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 truncate">{label}</div>
    </div>
  );
}
