import { getCollections } from '../database/connection';
import { DbIdempotencyKey } from '../database/types';

export class IdempotencyService {
  public static async getRecord(key: string): Promise<DbIdempotencyKey | null> {
    if (!key) return null;
    const collections = getCollections();
    return collections.idempotencyKeys.findOne({ _id: key });
  }

  public static async saveRecord(
    key: string,
    path: string,
    responseStatus: number,
    responseBody: unknown
  ): Promise<void> {
    if (!key) return;
    const collections = getCollections();
    const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours TTL

    await collections.idempotencyKeys.updateOne(
      { _id: key },
      {
        $set: {
          path,
          responseStatus,
          responseBody,
          createdAt: new Date(),
          expireAt
        }
      },
      { upsert: true }
    );
  }
}
