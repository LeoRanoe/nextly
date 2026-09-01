import { type SQL, sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import { db } from '../db/client';
import { maybe, text } from './row';

/**
 * The audit trail every Server Action writes to (`logActivity`,
 * `services/posting.ts`). Two readers: a document's detail page asks "what
 * happened to this record", and the Overview's Recent activity panel asks
 * "what happened at all".
 */

export type ActivityEntry = {
  id: string;
  action: string;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  createdAt: string;
};

export async function listActivity({
  entityType,
  entityId,
  limit = 50,
}: {
  entityType?: string;
  entityId?: string;
  limit?: number;
}): Promise<ActivityEntry[]> {
  if (!isDatabaseConfigured()) return [];

  const conditions: SQL[] = [];
  if (entityType) conditions.push(sql`a.entity_type = ${entityType}`);
  if (entityId) conditions.push(sql`a.entity_id = ${entityId}`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT a.id, a.action, a.entity_type, a.entity_id::text, a.entity_label,
           a.created_at::text, m.full_name AS actor_name
      FROM activity_logs a
      LEFT JOIN members m ON m.id = a.actor_id
      ${where}
     ORDER BY a.created_at DESC
     LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: text(row.id),
    action: text(row.action),
    actorName: maybe(row.actor_name),
    entityType: text(row.entity_type),
    entityId: maybe(row.entity_id),
    entityLabel: maybe(row.entity_label),
    createdAt: text(row.created_at),
  }));
}
