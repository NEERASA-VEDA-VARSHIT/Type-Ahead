import { useState, useEffect, useRef, useCallback } from 'react';
import { Suggestion } from '../types';
import { fetchSuggestions, submitSearch } from '../api';

interface SearchBoxProps {
  onNavigateToTrending: () => void;
}

export default function SearchBox({ onNavigateToTrending }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mode, setMode] = useState<'historical' | 'trending'>('historical');
  const [cacheHit, setCacheHit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchSuggest = useCallback(async (prefix: string) => {
    if (prefix.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSuggestions(prefix, mode);
      setSuggestions(data.suggestions);
      setCacheHit(data.cacheHit);
      setSelectedIndex(-1);
    } catch (err: any) {
      setError(err.message);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggest(query.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSuggest]);

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery ?? query.trim();
    if (!q) return;
    try {
      await submitSearch(q);
      setShowSuggestions(false);
    } catch {
      // silently fail
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        const selected = suggestions[selectedIndex];
        setQuery(selected.query);
        handleSearch(selected.query);
      } else {
        handleSearch();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={handleKeyDown}
            placeholder="Search products..."
            className="w-full px-4 py-3 pr-10 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <button
          onClick={() => handleSearch()}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          Search
        </button>
      </div>

      {error && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.query}
              onMouseDown={() => {
                setQuery(s.query);
                handleSearch(s.query);
              }}
              className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-blue-50 transition-colors ${
                i === selectedIndex ? 'bg-blue-50 ring-1 ring-blue-200' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {s.query}
                </div>
                <div className="text-xs text-gray-500">
                  Score: {s.score.toLocaleString()} &middot; Total: {s.totalCount.toLocaleString()} &middot; Recent: {s.recentCount.toLocaleString()}
                </div>
              </div>
              {i === selectedIndex && (
                <span className="text-xs text-blue-500 ml-2">Enter</span>
              )}
            </button>
          ))}
          <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100 flex items-center justify-between">
            <span>
              {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
              {' \u2022 '}Use arrow keys
            </span>
            <span className={cacheHit ? 'text-green-500' : 'text-orange-500'}>
              {cacheHit ? 'Cache Hit' : 'Cache Miss'}
            </span>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-center gap-4">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1 shadow-sm">
          <span className="text-xs text-gray-500">Mode:</span>
          <button
            onClick={() => setMode('historical')}
            className={`text-xs px-2 py-0.5 rounded ${
              mode === 'historical' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Historical
          </button>
          <button
            onClick={() => setMode('trending')}
            className={`text-xs px-2 py-0.5 rounded ${
              mode === 'trending' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Trending
          </button>
        </div>
        <button
          onClick={onNavigateToTrending}
          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
        >
          View Trending Searches
        </button>
      </div>
    </div>
  );
}
