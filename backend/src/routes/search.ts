import { FastifyInstance } from 'fastify';
import { SearchBuffer } from '../search-buffer.js';
import { Metrics } from '../metrics.js';

export function registerSearchRoute(
  app: FastifyInstance,
  searchBuffer: SearchBuffer,
  metrics: Metrics,
): void {
  app.post('/api/search', async (request, reply) => {
    const { query } = request.body as { query?: string };
    if (!query || query.trim().length === 0) {
      return reply.status(400).send({ error: 'Query is required' });
    }

    metrics.incrementTotalSearches();
    searchBuffer.add(query);

    return reply.send({ message: 'Searched' });
  });
}
