import { useState } from 'react';
import SearchBox from './components/SearchBox';
import TrendingSection from './components/TrendingSection';
import MetricsPanel from './components/MetricsPanel';

export default function App() {
  const [showTrending, setShowTrending] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Type-Ahead Search
          </h1>
          <div className="flex gap-3">
            <button
              onClick={() => setShowTrending(!showTrending)}
              className={`text-sm px-3 py-1.5 rounded-full transition-colors ${
                showTrending
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {showTrending ? 'Hide Trending' : 'Trending'}
            </button>
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className={`text-sm px-3 py-1.5 rounded-full transition-colors ${
                showMetrics
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {showMetrics ? 'Hide Metrics' : 'Metrics'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <SearchBox onNavigateToTrending={() => setShowTrending(true)} />
        </div>

        {showTrending && (
          <div className="mb-8">
            <TrendingSection />
          </div>
        )}

        {showMetrics && <MetricsPanel />}

        <footer className="mt-16 text-center text-xs text-gray-400">
          Type-Ahead Search System &mdash; KV/Cache Architecture &mdash; Consistent Hashing with 3 Redis Nodes
        </footer>
      </main>
    </div>
  );
}
