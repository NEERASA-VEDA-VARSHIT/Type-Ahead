import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { QueryRecord, Suggestion, TrendingMode } from './types.js';

export class QueryStore {
  private store: Map<string, QueryRecord> = new Map();
  private prefixIndex: Map<string, QueryRecord[]> = new Map();
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureTable();
    this.loadFromDB();
    this.rebuildPrefixIndex();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queries (
        query TEXT PRIMARY KEY,
        total_count INTEGER NOT NULL DEFAULT 0,
        recent_count INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  private loadFromDB(): void {
    const rows = this.db.prepare('SELECT query, total_count, recent_count FROM queries').all() as any[];
    for (const row of rows) {
      this.store.set(row.query, {
        query: row.query,
        totalCount: row.total_count,
        recentCount: row.recent_count,
      });
    }
    console.log(`QueryStore: loaded ${this.store.size} records`);
  }

  getFromPrefix(prefix: string, mode: TrendingMode, limit: number = 10): Suggestion[] {
    const records = this.prefixIndex.get(prefix);
    if (!records) return [];

    const scored = records.map(r => ({
      query: r.query,
      totalCount: r.totalCount,
      recentCount: r.recentCount,
      score: mode === 'trending' ? r.totalCount + r.recentCount * 5 : r.totalCount,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  private rebuildPrefixIndex(): void {
    const start = Date.now();
    const index = new Map<string, QueryRecord[]>();

    for (const [query, record] of this.store) {
      const len = query.length;
      for (let i = 3; i <= len; i++) {
        const prefix = query.substring(0, i);
        let list = index.get(prefix);
        if (!list) {
          list = [];
          index.set(prefix, list);
        }
        list.push(record);
      }
    }

    this.prefixIndex = index;
    console.log(`PrefixIndex: built ${index.size} prefix entries in ${Date.now() - start}ms`);
  }

  private addToPrefixIndex(query: string, record: QueryRecord): void {
    const len = query.length;
    for (let i = 3; i <= len; i++) {
      const prefix = query.substring(0, i);
      let list = this.prefixIndex.get(prefix);
      if (!list) {
        list = [];
        this.prefixIndex.set(prefix, list);
      }
      list.push(record);
    }
  }

  get(query: string): QueryRecord | undefined {
    return this.store.get(query);
  }

  size(): number {
    return this.store.size;
  }

  updateCounts(entries: Map<string, number>): void {
    const updateStmt = this.db.prepare(
      'UPDATE queries SET total_count = total_count + ?, recent_count = recent_count + ? WHERE query = ?'
    );
    const insertStmt = this.db.prepare(
      'INSERT INTO queries (query, total_count, recent_count) VALUES (?, ?, ?)'
    );
    const checkStmt = this.db.prepare('SELECT 1 FROM queries WHERE query = ?');

    const tx = this.db.transaction(() => {
      for (const [query, increment] of entries) {
        const exists = checkStmt.get(query);
        if (exists) {
          updateStmt.run(increment, increment, query);
          const record = this.store.get(query)!;
          record.totalCount += increment;
          record.recentCount += increment;
        } else {
          insertStmt.run(query, increment, increment);
          const record: QueryRecord = { query, totalCount: increment, recentCount: increment };
          this.store.set(query, record);
          this.addToPrefixIndex(query, record);
        }
      }
    });
    tx();
  }

  decayRecentCounts(): void {
    const decayStmt = this.db.prepare(
      'UPDATE queries SET recent_count = CAST(ROUND(recent_count * 0.95) AS INTEGER)'
    );
    decayStmt.run();
    for (const record of this.store.values()) {
      record.recentCount = Math.floor(record.recentCount * 0.95);
    }
  }

  getTopByScore(mode: 'historical' | 'trending', limit: number = 10): QueryRecord[] {
    const records = Array.from(this.store.values());
    records.sort((a, b) => {
      const scoreA = a.totalCount + (mode === 'trending' ? a.recentCount * 5 : 0);
      const scoreB = b.totalCount + (mode === 'trending' ? b.recentCount * 5 : 0);
      return scoreB - scoreA;
    });
    return records.slice(0, limit);
  }

  loadCSV(csvPath: string): void {
    const content = readFileSync(csvPath, 'utf-8');
    const lines = content.trim().split('\n');
    const insertStmt = this.db.prepare(
      'INSERT OR REPLACE INTO queries (query, total_count, recent_count) VALUES (?, ?, ?)'
    );

    const tx = this.db.transaction(() => {
      for (const line of lines) {
        if (!line.trim()) continue;
        const commaIdx = line.lastIndexOf(',');
        if (commaIdx === -1) continue;
        let query = line.substring(0, commaIdx).replace(/^"|"$/g, '');
        const count = parseInt(line.substring(commaIdx + 1), 10);
        if (isNaN(count) || !query) continue;
        insertStmt.run(query, count, count);
        this.store.set(query, { query, totalCount: count, recentCount: count });
      }
    });
    tx();
    this.rebuildPrefixIndex();
    console.log(`CSV loaded: ${lines.length} lines, ${this.store.size} unique queries`);
  }

  close(): void {
    this.db.close();
  }
}
