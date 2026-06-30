import type { Db, Tx } from '../db/client.js';
import { auditLogs } from '../db/schema.js';

export async function audit(
  ex: Db | Tx,
  entry: { actorId?: string | null; action: string; entityType: string; entityId?: string; metadata?: unknown; ip?: string },
) {
  await ex.insert(auditLogs).values({
    actorId: entry.actorId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ?? null,
    ip: entry.ip,
  });
}
