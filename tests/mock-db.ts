import { ObjectId } from 'mongodb';

export class MockCollection<T extends Record<string, any>> {
  public items: T[] = [];

  constructor(initialItems: T[] = []) {
    this.items = [...initialItems];
  }

  private matchesFilter(item: T, filter: Record<string, any>): boolean {
    for (const key of Object.keys(filter)) {
      const condition = filter[key];

      if (key === '$or' && Array.isArray(condition)) {
        const matchesAny = condition.some((cond) => this.matchesFilter(item, cond));
        if (!matchesAny) return false;
        continue;
      }

      if (condition && typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
        if ('$in' in condition && Array.isArray(condition.$in)) {
          if (!condition.$in.includes(item[key])) return false;
          continue;
        }
        if ('$gte' in condition) {
          if (item[key] < condition.$gte) return false;
          continue;
        }
        if ('$lte' in condition) {
          if (item[key] > condition.$lte) return false;
          continue;
        }
      }

      if (item[key] !== condition) {
        return false;
      }
    }
    return true;
  }

  public async findOne(filter: Record<string, any>): Promise<T | null> {
    const found = this.items.find((item) => this.matchesFilter(item, filter));
    return found ? ({ ...found } as T) : null;
  }

  public find(filter: Record<string, any> = {}) {
    let results = this.items.filter((item) => this.matchesFilter(item, filter));

    return {
      sort: (sortObj: Record<string, number>) => {
        const sortKey = Object.keys(sortObj)[0];
        const dir = sortObj[sortKey];
        if (sortKey) {
          results.sort((a, b) => {
            if (a[sortKey] > b[sortKey]) return dir === 1 ? 1 : -1;
            if (a[sortKey] < b[sortKey]) return dir === 1 ? -1 : 1;
            return 0;
          });
        }
        return {
          limit: (limitCount: number) => ({
            toArray: async () => results.slice(0, limitCount).map((i) => ({ ...i }))
          }),
          toArray: async () => results.map((i) => ({ ...i }))
        };
      },
      limit: (limitCount: number) => ({
        toArray: async () => results.slice(0, limitCount).map((i) => ({ ...i }))
      }),
      toArray: async () => results.map((i) => ({ ...i }))
    };
  }

  public async insertOne(doc: T): Promise<{ insertedId: ObjectId }> {
    const itemWithId = {
      ...doc,
      _id: doc._id || new ObjectId()
    };
    this.items.push(itemWithId as T);
    return { insertedId: itemWithId._id };
  }

  public async updateOne(
    filter: Record<string, any>,
    update: Record<string, any>,
    options: { upsert?: boolean } = {}
  ): Promise<{ modifiedCount: number; upsertedCount: number }> {
    const index = this.items.findIndex((item) => this.matchesFilter(item, filter));

    if (index === -1) {
      if (options.upsert) {
        const newDoc = {
          ...filter,
          ...(update.$set || {}),
          _id: filter._id || new ObjectId()
        };
        this.items.push(newDoc as T);
        return { modifiedCount: 0, upsertedCount: 1 };
      }
      return { modifiedCount: 0, upsertedCount: 0 };
    }

    const current = { ...this.items[index] };

    if (update.$set) {
      Object.assign(current, update.$set);
    }
    if (update.$inc) {
      for (const incKey of Object.keys(update.$inc)) {
        current[incKey] = (current[incKey] || 0) + update.$inc[incKey];
      }
    }

    this.items[index] = current;
    return { modifiedCount: 1, upsertedCount: 0 };
  }

  public async deleteOne(filter: Record<string, any>): Promise<{ deletedCount: number }> {
    const index = this.items.findIndex((item) => this.matchesFilter(item, filter));
    if (index !== -1) {
      this.items.splice(index, 1);
      return { deletedCount: 1 };
    }
    return { deletedCount: 0 };
  }

  public async countDocuments(filter: Record<string, any> = {}): Promise<number> {
    return this.items.filter((item) => this.matchesFilter(item, filter)).length;
  }

  public async createIndex(_keys: unknown, _options?: unknown): Promise<string> {
    return 'mock_index';
  }
}

export function createMockCollections() {
  return {
    users: new MockCollection<any>(),
    customerBalances: new MockCollection<any>(),
    pcs: new MockCollection<any>(),
    sessions: new MockCollection<any>(),
    openTimeAuths: new MockCollection<any>(),
    payments: new MockCollection<any>(),
    pricing: new MockCollection<any>(),
    auditRecords: new MockCollection<any>(),
    idempotencyKeys: new MockCollection<any>()
  };
}
