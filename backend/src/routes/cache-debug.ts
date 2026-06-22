import { FastifyInstance } from 'fastify';
import { CacheManager } from '../cache-manager.js';

export function registerCacheDebugRoute(
  app: FastifyInstance,
  cacheManager: CacheManager,
): void {
  app.get('/api/cache/debug', async (request, reply) => {
    const { prefix } = request.query as { prefix?: string };
    if (!prefix || prefix.trim().length === 0) {
      return reply.status(400).send({ error: 'Prefix is required' });
    }

    try {
      const info = await cacheManager.getCacheDebug(prefix);
      return reply.send(info);
    } catch (err) {
      console.error('Cache debug error:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
