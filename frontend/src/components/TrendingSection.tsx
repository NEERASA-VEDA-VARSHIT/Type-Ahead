import { useState, useEffect } from 'react';
import { Suggestion } from '../types';
import { fetchTrending, submitSearch } from '../api';

export default function TrendingSection() {
  const [trending, setTrending] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'trending' | 'historical'>('trending');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTrending(mode);
      setTrending(data.trending);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [mode]);

  const handleClick = async (query: string) => {
    try {
      await submitSearch(query);
    } catch {
      // silently fail
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          {mode === 'trending' ? 'Trending Searches' : 'Top Searches'}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('trending')}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              mode === 'trending'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Trending
          </button>
          <button
            onClick={() => setMode('historical')}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              mode === 'historical'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Historical
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-100">
          {trending.map((item, i) => (
            <button
              key={item.query}
              onClick={() => handleClick(item.query)}
              className="w-full px-4 py-3 flex items-center gap-4 hover:bg-blue-50 transition-colors text-left"
            >
              <span className="w-6 text-center text-sm font-bold text-gray-400">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {item.query}
                </div>
                <div className="text-xs text-gray-500">
                  Score: {item.score.toLocaleString()}
                  {' \u2022 '}Total: {item.totalCount.toLocaleString()}
                  {' \u2022 '}Recent: {item.recentCount.toLocaleString()}
                </div>
              </div>
              <span className="text-xs text-gray-400">
                #{i + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
