import { FastifyInstance } from 'fastify';
import { CacheManager } from '../cache-manager.js';
import { Metrics } from '../metrics.js';

export function registerSuggestRoute(
  app: FastifyInstance,
  cacheManager: CacheManager,
  metrics: Metrics,
): void {
  app.get('/api/suggest', async (request, reply) => {
    metrics.incrementSuggestRequests();

    const { q, mode } = request.query as { q?: string; mode?: string };
    if (!q || q.trim().length === 0) {
      return reply.send({ suggestions: [] });
    }

    const prefix = q.toLowerCase().trim();
    const trendingMode = mode === 'trending' ? 'trending' : 'historical';

    try {
      const { suggestions, cacheHit } = await cacheManager.getSuggestions(prefix, trendingMode);
      return reply.send({
        suggestions,
        prefix,
        mode: trendingMode,
        cacheHit,
      });
    } catch (err) {
      console.error('Suggest error:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
