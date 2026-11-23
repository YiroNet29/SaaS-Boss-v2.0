/**
 * Remembers rows this tab deleted a moment ago. A live-update notice can arrive after the delete (for
 * example the notice about our own earlier insert, delayed): it must not put the deleted row back on
 * screen. Saving a row with the same id again forgets it.
 */
export class Tombstones {
  private deleted = new Map<string, number>();

  constructor(private readonly ttlMs = 2 * 60_000, private readonly now: () => number = Date.now) {}

  private key = (table: string, id: string) => `${table}:${id}`;

  mark(table: string, id: string) {
    this.deleted.set(this.key(table, id), this.now());
    if (this.deleted.size > 1000) {
      const t = this.now();
      for (const [k, at] of this.deleted) if (t - at > this.ttlMs) this.deleted.delete(k);
    }
  }

  forget(table: string, id: string) {
    this.deleted.delete(this.key(table, id));
  }

  has(table: string, id: string): boolean {
    const at = this.deleted.get(this.key(table, id));
    if (at === undefined) return false;
    if (this.now() - at > this.ttlMs) {
      this.deleted.delete(this.key(table, id));
      return false;
    }
    return true;
  }
}
