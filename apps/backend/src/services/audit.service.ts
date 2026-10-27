import { ObjectId } from 'mongodb';
import { getCollections } from '../database/connection';
import { DbAuditRecord } from '../database/types';

export class AuditService {
  public static sanitize(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => AuditService.sanitize(item));

    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = ['password', 'passwordHash', 'temporaryPassword', 'token', 'jwt', 'secret', 'deviceKey'];

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        sanitized[key] = AuditService.sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  public static async log(
    action: string,
    details: string,
    actorId: string,
    actorName: string,
    actorRole: string,
    targetId?: string,
    targetType?: string
  ): Promise<void> {
    try {
      const collections = getCollections();
      const record: DbAuditRecord = {
        _id: new ObjectId(),
        id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date(),
        actorId,
        actorName,
        actorRole,
        action,
        details,
        targetId,
        targetType
      };

      await collections.auditRecords.insertOne(record);
      console.log(`[AUDIT] [${actorRole.toUpperCase()}] ${action}: ${details}`);
    } catch (err) {
      console.error('[AUDIT] Failed to persist audit record:', err);
    }
  }
}
