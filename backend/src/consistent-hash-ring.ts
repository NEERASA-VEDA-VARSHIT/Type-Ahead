import { createHash } from 'crypto';

interface RingEntry {
  hash: bigint;
  node: string;
}

export class ConsistentHashRing {
  private ring: RingEntry[] = [];
  private nodes: Set<string> = new Set();
  readonly virtualNodeCount: number;

  constructor(virtualNodeCount: number = 100) {
    this.virtualNodeCount = virtualNodeCount;
  }

  addNode(node: string): void {
    if (this.nodes.has(node)) return;
    this.nodes.add(node);
    for (let i = 0; i < this.virtualNodeCount; i++) {
      const key = `${node}:${i}`;
      const hash = ConsistentHashRing.hashKey(key);
      this.ring.push({ hash, node });
    }
    this.sortRing();
  }

  removeNode(node: string): void {
    if (!this.nodes.has(node)) return;
    this.nodes.delete(node);
    this.ring = this.ring.filter(entry => entry.node !== node);
  }

  getNode(key: string): string {
    if (this.ring.length === 0) {
      throw new Error('No nodes available in the hash ring');
    }
    const hash = ConsistentHashRing.hashKey(key);
    let lo = 0;
    let hi = this.ring.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.ring[mid].hash < hash) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo === this.ring.length) {
      lo = 0;
    }
    return this.ring[lo].node;
  }

  static hashKey(key: string): bigint {
    const hash = createHash('sha256').update(key).digest('hex');
    return BigInt('0x' + hash);
  }

  getRingSize(): number {
    return this.ring.length;
  }

  getNodes(): string[] {
    return Array.from(this.nodes);
  }

  getNodeVirtualNodeCount(): number {
    return this.virtualNodeCount;
  }

  private sortRing(): void {
    this.ring.sort((a, b) => {
      if (a.hash < b.hash) return -1;
      if (a.hash > b.hash) return 1;
      return 0;
    });
  }
}
