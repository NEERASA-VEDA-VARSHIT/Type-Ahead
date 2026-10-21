# Type-Ahead Search System

[![CI](https://github.com/NEERASA-VEDA-VARSHIT/Type-Ahead/actions/workflows/ci.yml/badge.svg)](https://github.com/NEERASA-VEDA-VARSHIT/Type-Ahead/actions/workflows/ci.yml)
[![Node.js 18+](https://img.shields.io/badge/node.js-18%20%7C%2020%20%7C%2022-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![Tests: 18/18 Passed](https://img.shields.io/badge/tests-18%20passed-brightgreen.svg)](backend/tests/)

A distributed, fault-tolerant search typeahead service utilizing a consistent hash ring across multi-node Redis clusters, backed by WAL-mode SQLite persistence and automatic origin fallback.

> [!NOTE]
> **Consolidation Note:** This repository serves as the single canonical flagship for the Type-Ahead systems project across the portfolio (consolidating findings from exploratory prototypes). It features real Redis network clustering, batch flush debouncing, WAL SQLite storage, automated test coverage, and a production React + Tailwind UI.

---

## Architecture

```
Frontend (React + Vite + TailwindCSS)
        |
        | HTTP (proxy via Vite)
        v
Fastify API Server (Node.js + TypeScript)
        |
    +---+---+
    |       |
    v       v
Query Store  Suggestions Cache
 (SQLite)    (Redis x 3)
    |             ^
    v             |
Prefix Index      Consistent Hash Ring
(prefix->all      (SHA256 + 100 VNs/node)
 matching QRs)
```

### Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | React + Vite + TailwindCSS | Search UI with debounced suggestions |
| API Server | Fastify + TypeScript | Request handling and orchestration |
| Query Store | SQLite + In-Memory Map | Persistent query frequency storage |
| Prefix Index | In-Memory Map | Pre-built prefix -> matching queries (O(1) lookup, no full scan) |
| Cache Layer | 3x Redis instances | Prefix-to-suggestions cache (top 10) |
| Hash Ring | Manual Implementation | Distributes cache keys across Redis nodes |

---

## Key-Value Approach vs Trie Approach

### Why Not Trie?

A Trie (prefix tree) is the natural Data Structures & Algorithms solution for autocomplete. It stores characters in a tree structure where each node represents a prefix. However:

1. **Distributed Systems Focus**: This assignment is about distributed systems, not data structures. A Trie is a single-node solution that cannot easily scale across machines.
2. **Impractical for Large-Scale**: A Trie would need to be replicated in full across every server, wasting memory. Every server would need the entire dataset.
3. **Update Complexity**: Adding new queries or updating frequencies in a Trie requires tree mutations, making concurrent updates complex.
4. **No Built-in Caching**: A Trie doesn't naturally support caching. Every query traverses the tree, which becomes expensive under high load.

### Why Key-Value / Cache Approach?

1. **Prefix Cache**: Store precomputed top-10 results for each prefix. Lookup is O(1) - just a cache get.
2. **Distributable**: Cache entries can be distributed across nodes using consistent hashing. No single node needs the full dataset.
3. **Scale-out**: Add more Redis nodes to handle more traffic. The hash ring redistributes keys automatically.
4. **Industry Standard**: Google, Amazon, and Netflix use similar approaches - precompute and cache suggestions, don't traverse trees on every keystroke.
5. **Update Efficiency**: When a query frequency changes, only invalidate the affected prefix keys. No tree restructuring.

### Tradeoffs

| Aspect | Trie | KV/Cache (This Design) |
|--------|------|----------------------|
| Lookup Speed | O(k) where k = prefix length | O(1) cache get |
| Memory | O(total characters) | O(queries + prefix index) |
| Distribution | Difficult (needs sharded trie) | Trivial (consistent hashing) |
| Cache Miss Cost | ~O(results) traverse tree | O(1) prefix index lookup + O(P log P) sort |
| Update Cost | Tree mutations | Cache invalidation + incremental index update |

The Prefix Index stores every query under every prefix it matches (built once during startup). On cache miss, we look up the prefix in the index map (O(1)), score all matching queries, and sort for the top 10. This avoids scanning the entire 100k record store.

---

## Consistent Hashing

### What is Consistent Hashing?

Consistent hashing maps keys to nodes in a way that minimizes re-mapping when nodes are added or removed. Unlike modulo hashing (`hash(key) % N`), where changing N remaps almost all keys, consistent hashing only remaps keys that belong to the affected nodes.

### Implementation

```
1. Create a circular hash ring (2^256 space via SHA256)
2. Each Redis node gets 100 virtual nodes placed on the ring
3. For a given key (prefix), hash it and walk clockwise
4. The first virtual node encountered is the target
```

```typescript
hash("iph") -> 0xA3F1... -> walk clockwise -> redis-b
```

### Virtual Nodes

Each real node is represented by 100 virtual nodes spread across the ring:

```
redis-a:0   -> hash("redis-a:0")   -> position 0x12AB...
redis-a:1   -> hash("redis-a:1")   -> position 0x45CD...
...
redis-a:99  -> hash("redis-a:99")  -> position 0x78EF...
redis-b:0   -> hash("redis-b:0")   -> position 0x90GH...
```

**Why Virtual Nodes?** Without virtual nodes, if a node fails, all its keys go to the next node, creating a load imbalance. Virtual nodes spread each node's data across ~100 positions, so failure distributes load evenly across remaining nodes.

### Binary Search on the Ring

The ring is stored as a sorted array of `{hash, node}` pairs. Finding the target node for a key is O(log N):

```
hash(key) -> binary search sorted ring -> wrap around if needed -> return node
```

---

## Cache Flow

```
GET /suggest?q=iph
        |
    normalize: "iph"
        |
    hash("iph") -> find Redis node
        |
    +----+----+
    |         |
    hit       miss
    |         |
    return    look up PrefixIndex["iph"]
    cached    (O(1) Map.get)
    results   |
              compute score for each match
              sort by score (O(P log P), P = matches)
              take top 10
              store in Redis (TTL: 300s)
              return
```

### Cache Invalidation

When a search is submitted via POST /search, the SearchBuffer increments counts in the background. After the flush, all affected cache keys are invalidated:

```
query: "iphone charger"
        |
    generate prefixes (len >= 3):
    "iph", "ipho", "iphon", "iphone", "iphone ", "iphone c", ...
        |
    for each prefix:
        hash(prefix) -> find Redis node
        DEL suggest:<prefix>:historical
        DEL suggest:<prefix>:trending
```

This ensures the next suggest request for any of these prefixes will recompute results with updated counts.

---

## Batch Write Flow

```
POST /search { query: "iphone" }
        |
    +--------+
    |        |
    user     SearchBuffer.add("iphone")
    gets     buffer["iphone"] += 1
    "ok"
             |
    every 10 seconds (flush interval):
        |
        1. Snapshot buffer
        2. Clear buffer
        3. Aggregate: {"iphone": 25, "samsung": 10, ...}
        4. BEGIN TRANSACTION
        5. UPDATE queries SET total_count += 25 WHERE query = 'iphone'
        6. UPDATE queries SET recent_count += 25 WHERE query = 'iphone'
        7. Update in-memory QueryStore
        8. COMMIT
        9. Invalidate affected cache keys
```

### Why Batch Writes?

- **Reduces DB writes**: 25 searches for "iphone" -> 1 DB UPDATE instead of 25
- **Write coalescing**: 10 seconds of searches are merged into bulk updates
- **Maintains performance**: SQLite handles sequential reads well; batch writes avoid lock contention

---

## Trending Logic

### Score Formula

```
        historical mode:  score = totalCount
        trending mode:    score = totalCount + recentCount * 5
```

### Recent Count Decay

Every 60 seconds:

```
recentCount *= 0.95
```

This creates an exponential decay where older contributions fade over time. A query that was popular yesterday but dormant today will have a lower trending score than a consistently popular query.

### Example

| Query | totalCount | recentCount | Historical Score | Trending Score |
|-------|-----------|-------------|-----------------|----------------|
| iphone | 200000 | 15000 | 200000 | 200000 + 75000 = 275000 |
| old trend | 50000 | 1000 | 50000 | 50000 + 5000 = 55000 |
| new surge | 5000 | 4000 | 5000 | 5000 + 20000 = 25000 |

"new surge" has low historical count but high recent activity, making it trend.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/suggest?q=<prefix>&mode=historical\|trending` | Get suggestions |
| POST | `/api/search` | Submit a search |
| GET | `/api/trending?mode=historical\|trending` | Get trending searches |
| GET | `/api/cache/debug?prefix=<prefix>` | Debug cache routing |
| GET | `/api/metrics` | System metrics |
| GET | `/api/health` | Health check |

---

## Setup & Run

### Prerequisites

- Node.js 18+
- Docker Desktop
- npm

### 1. Start Redis Nodes

```bash
docker compose up -d
```

This starts 3 independent Redis instances:
- `redis-a` on port 6379
- `redis-b` on port 6380
- `redis-c` on port 6381

### 2. Install Dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Generate Dataset

```bash
cd backend
npx tsx data/generate.ts
```

Generates `data/queries.csv` with 100,000 realistic search queries following a Zipfian distribution.

### 4. Start Backend

```bash
cd backend
npm start
```

Starts Fastify server on `http://localhost:3001`. On startup:
- Loads CSV into SQLite (first run only)
- Builds in-memory QueryStore
- Connects to 3 Redis instances
- Starts batch flush worker
- Starts decay job

### 5. Start Frontend

```bash
cd frontend
npm run dev
```

Starts Vite dev server on `http://localhost:5173`. Opens search UI.

---

## Performance Discussion

### Prefix Index (No Full Scan)

On a cache miss, we do **not** scan the entire 100k store. Instead:

1. **Lookup** `prefixIndex.get("iph")` -- O(1) Map access
2. **Score** all matching queries -- O(P) where P = queries matching that prefix
3. **Sort** and take top 10 -- O(P log P)

For short prefixes (e.g., "i", "ip"), P could be large (~5000). For longer prefixes (e.g., "iphon"), P is small (~10). The average case is efficient because longer prefixes naturally filter most queries.

### Prefix Index Memory

The index stores references to `QueryRecord` objects (not copies). With 100k queries and ~15 chars average length, each query appears under ~12 prefixes. Total: ~1.2M references ~ 10MB extra memory. Shared references mean count updates are visible instantly without rebuilding.

### Build Cost

The prefix index is built once during startup by iterating all 100k queries. This takes ~200-500ms. New queries added via batch flush are incrementally inserted into the index (no full rebuild needed).

### Scaling

- **More queries**: Add more RAM. 100k entries ~ 50MB. 1M entries ~ 500MB.
- **More traffic**: Add more Redis nodes. Hash ring redistributes keys.
- **Faster sort**: For very short prefixes with many matches, use a partial sort or bounded heap instead of full sort.

### Bottleneck Analysis

| Component | Bottleneck | Mitigation |
|-----------|-----------|------------|
| Cache Miss | O(P log P) sort | Precomputed prefix index (no full scan) |
| Batch Flush | SQLite write lock | WAL mode, batch coalescing |
| Redis | Memory | TTL eviction, more nodes |
| Consistent Hashing | Binary search O(log N) | N = 300 (3x100 VNs), negligible |

---

## Viva Questions & Answers

### Q1: Why not use a Trie?

Trie is a single-node solution. In a distributed system, you cannot share a Trie across machines efficiently. Every server would need the full Trie, wasting memory. The KV/cache approach distributes cache entries across nodes on a per-prefix basis. Also, Trie updates require tree synchronization; cache invalidation is a simple key deletion.

### Q2: How does consistent hashing differ from modulo hashing?

Modulo hashing (`hash(key) % N`) maps keys evenly but when N changes, almost all keys remap to different nodes. This causes a cache stampede. Consistent hashing only remaps keys belonging to the affected node's range. With 100 virtual nodes per node, adding/removing one node remaps only ~1/4 of keys (25% instead of 100%).

### Q3: What are virtual nodes and why are they needed?

Virtual nodes are multiple positions on the hash ring for each physical node. Without them, when a node fails, all its keys go to the next node on the ring, overloading it. With virtual nodes, each node's data is spread across ~100 positions. On failure, the load is distributed evenly among remaining nodes.

### Q4: How is trending different from historical ranking?

Historical ranking uses `totalCount` only -- a query that was popular years ago still ranks high. Trending uses `totalCount + recentCount * 5` with exponential decay (0.95x every minute). This gives weight to recent popularity. A new query with 5000 recent searches can outrank an old query with 200k total but 0 recent activity.

### Q5: Why batch writes instead of immediate writes?

Each POST /search would trigger a SQLite write. At scale (1000+ QPS), this creates contention and slow responses. Batch writes coalesce 10 seconds of searches into 1 DB transaction. For "iphone" searched 25 times in 10 seconds, we do 1 UPDATE instead of 25. This reduces DB writes by ~95%.

### Q6: How does cache invalidation work?

When a query's count changes (after batch flush), we generate all possible prefixes starting at length 3 (e.g., "iphone charger" -> "iph", "ipho", "iphon", "iphone", etc.). For each prefix, we find the responsible Redis node via consistent hashing and delete the cache key. The next request for that prefix will miss cache and recompute.

### Q7: What is the TTL and why 300 seconds?

300 seconds (5 minutes) balances freshness vs. performance. Short TTL means more recomputations. Long TTL means stale suggestions. Since batch flushes invalidate affected keys anyway, the TTL is a safety net for keys that weren't invalidated (e.g., trending queries that change due to decay).

### Q8: How would you scale this to 10 million queries?

1. **Prefix Index memory**: At 10M queries, the prefix index (~10 bytes per reference * avg 12 prefixes = ~1.2GB) becomes large. Partition the prefix index by first character across multiple servers, or use a sorted data structure (e.g., prefix-indexed Map with bounded entries).
2. **Add Redis nodes**: The consistent hash ring supports unlimited nodes. With 100 VNs each, add replicas for read scaling.
3. **Connection pooling**: Use Redis connection pools to handle more concurrent requests.
4. **Read replicas**: SQLite doesn't support read replicas natively. Migrate to PostgreSQL or MySQL for better read scaling.

### Q9: What happens if a Redis node goes down?

The consistent hash ring distributes that node's keys to remaining nodes (via the next virtual node clockwise). Cache misses increase temporarily, but the system remains operational. The QueryStore in the backend has the complete dataset, so all requests are answered correctly, just slower.

### Q10: How does the score calculation account for both popularity and recency?

The formula `score = totalCount + recentCount * 5` combines historical popularity (totalCount) with recent activity (recentCount weighted 5x). The exponential decay (0.95x per minute) ensures that "yesterday's news" gradually fades. A query with 1000 recent searches today has the same trending contribution as 200 recent searches 15 minutes ago (1000 * 0.95^15 ≈ 460... wait, no). The decay means a query needs consistent daily traffic to maintain its trending score.

### Q11: How does the Prefix Index avoid scanning all 100k queries?

The Prefix Index is a `Map<string, QueryRecord[]>` built during startup. For every query, we iterate over all its substrings starting at length 3 (e.g., "iphone" -> "iph", "ipho", "iphon", "iphone") and add the `QueryRecord` reference to each prefix's array. On a cache miss, we simply do `prefixIndex.get(prefix)` -- an O(1) map lookup -- and get an array of every query that starts with that prefix. We then compute scores and sort for the top 10. This eliminates the O(n) full-store scan entirely.

### Q12: Why not just store the top 10 per prefix in the index?

If we only stored top 10 (sorted by `totalCount`), the trending mode would be incorrect. A query with low totalCount but very high recentCount could be excluded from the top 10 even though it should rank high in trending mode. By storing all matching queries (as references), we can compute the correct top 10 for any scoring function at lookup time. The memory cost is about 10MB for 100k queries.

---

## Metrics

Available at `/api/metrics`:

```json
{
  "totalSearches": 1042,
  "suggestRequests": 5283,
  "cacheHits": 4721,
  "cacheMisses": 562,
  "cacheHitRate": 89.36,
  "batchFlushes": 37,
  "databaseWrites": 284,
  "queriesFlushed": 1042,
  "queryStoreSize": 100000,
  "searchBufferSize": 0,
  "uptime": 385
}
```

The cache hit rate indicates how effectively the system is serving cached suggestions. A rate above 85% is healthy.

---

## Cache Debug Endpoint

```
GET /api/cache/debug?prefix=iph

Response:
{
  "prefix": "iph",
  "node": "redis-b",
  "cacheHit": false,
  "hashValue": "72653120369853491828293715062874919315...",
  "virtualNodeCount": 100,
  "ringSize": 300,
  "activeNodes": ["redis-a", "redis-b", "redis-c"]
}
```

This endpoint demonstrates the cache routing: the prefix "iph" hashes to a position on the ring that maps to "redis-b".
