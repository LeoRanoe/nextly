import { type SQL, sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import { db } from '../db/client';
import { maybe, text } from './row';

/**
 * The audit trail every Server Action writes to (`logActivity`,
 * `services/posting.ts`) and, until now, nothing ever read. A document's
 * detail page is the first caller: "what happened to this record" is
 * exactly the question `activity_logs` exists to answer.
 */

export type ActivityEntry = {
  id: string;
  action: string;
  actorName: string | null;
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
    SELECT a.id, a.action, a.entity_label, a.created_at::text, m.full_name AS actor_name
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
    entityLabel: maybe(row.entity_label),
    createdAt: text(row.created_at),
  }));
}
