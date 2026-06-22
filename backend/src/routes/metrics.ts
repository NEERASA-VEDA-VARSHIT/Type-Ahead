import { FastifyInstance } from 'fastify';
import { Metrics } from '../metrics.js';
import { QueryStore } from '../query-store.js';
import { SearchBuffer } from '../search-buffer.js';

export function registerMetricsRoute(
  app: FastifyInstance,
  metrics: Metrics,
  queryStore: QueryStore,
  searchBuffer: SearchBuffer,
): void {
  app.get('/api/metrics', async (_request, reply) => {
    metrics.setQueryStoreSize(queryStore.size());
    metrics.setSearchBufferSize(searchBuffer.size());
    return reply.send(metrics.getData());
  });
}
