import { FastifyInstance } from 'fastify';
import { QueryStore } from '../query-store.js';
import { Suggestion } from '../types.js';

export function registerTrendingRoute(
  app: FastifyInstance,
  queryStore: QueryStore,
): void {
  app.get('/api/trending', async (request, reply) => {
    const { mode } = request.query as { mode?: string };
    const trendingMode = mode === 'historical' ? 'historical' : 'trending';

    const records = queryStore.getTopByScore(trendingMode, 10);
    const suggestions: Suggestion[] = records.map(r => ({
      query: r.query,
      totalCount: r.totalCount,
      recentCount: r.recentCount,
      score: trendingMode === 'trending'
        ? r.totalCount + r.recentCount * 5
        : r.totalCount,
    }));

    return reply.send({ trending: suggestions, mode: trendingMode });
  });
}
