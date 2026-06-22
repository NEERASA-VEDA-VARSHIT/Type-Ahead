import Fastify from 'fastify';
import cors from '@fastify/cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { QueryStore } from './query-store.js';
import { CacheManager } from './cache-manager.js';
import { SearchBuffer } from './search-buffer.js';
import { Metrics } from './metrics.js';

import { registerSuggestRoute } from './routes/suggest.js';
import { registerSearchRoute } from './routes/search.js';
import { registerTrendingRoute } from './routes/trending.js';
import { registerCacheDebugRoute } from './routes/cache-debug.js';
import { registerMetricsRoute } from './routes/metrics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CSV_PATH = join(__dirname, '..', 'data', 'queries.csv');
const DB_PATH = join(__dirname, '..', 'data', 'queries.db');

const REDIS_NODES = [
  { name: 'redis-a', host: '127.0.0.1', port: 6379 },
  { name: 'redis-b', host: '127.0.0.1', port: 6380 },
  { name: 'redis-c', host: '127.0.0.1', port: 6381 },
];

const PORT = parseInt(process.env.PORT || '3001', 10);
const FLUSH_INTERVAL = parseInt(process.env.FLUSH_INTERVAL || '10000', 10);
const DECAY_INTERVAL = parseInt(process.env.DECAY_INTERVAL || '60000', 10);

async function main() {
  console.log('=== Type-Ahead Search Backend ===');

  console.log('Initializing QueryStore...');
  const queryStore = new QueryStore(DB_PATH);

  if (queryStore.size() === 0) {
    console.log(`Loading CSV data from ${CSV_PATH}...`);
    queryStore.loadCSV(CSV_PATH);
  } else {
    console.log(`Database already has ${queryStore.size()} records`);
  }

  console.log('Initializing Metrics...');
  const metrics = new Metrics();

  console.log('Initializing CacheManager...');
  const cacheManager = new CacheManager(queryStore, metrics, 300);
  for (const node of REDIS_NODES) {
    cacheManager.addNode(node.name, node.host, node.port);
  }
  await cacheManager.connectAll();

  console.log('Initializing SearchBuffer...');
  const searchBuffer = new SearchBuffer(queryStore, cacheManager, metrics, FLUSH_INTERVAL);
  searchBuffer.start();

  console.log('Starting decay job...');
  const decayJob = setInterval(() => {
    queryStore.decayRecentCounts();
    console.log('[Decay] recentCount reduced by 5%');
  }, DECAY_INTERVAL);

  console.log('Setting up Fastify...');
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  registerSuggestRoute(app, cacheManager, metrics);
  registerSearchRoute(app, searchBuffer, metrics);
  registerTrendingRoute(app, queryStore);
  registerCacheDebugRoute(app, cacheManager);
  registerMetricsRoute(app, metrics, queryStore, searchBuffer);

  app.get('/api/health', async () => {
    return {
      status: 'ok',
      queryStoreSize: queryStore.size(),
      uptime: metrics.getData().uptime,
    };
  });

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server running on http://localhost:${PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    searchBuffer.stop();
    clearInterval(decayJob);
    await cacheManager.disconnectAll();
    queryStore.close();
    process.exit(1);
  }

  const shutdown = async () => {
    console.log('\nShutting down...');
    searchBuffer.stop();
    clearInterval(decayJob);
    await cacheManager.disconnectAll();
    queryStore.close();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
