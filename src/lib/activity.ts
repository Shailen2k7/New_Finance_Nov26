import { and, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "./db";

export type ActivityFilters = { actor?: string; entity?: string; verb?: string; from?: string; to?: string; q?: string; page?: number };

export async function getActivity(f: ActivityFilters) {
  const db = await getDb();
  const a = schema.auditLogs;
  const conds: SQL[] = [];
  if (f.actor) conds.push(eq(a.actor, f.actor));
  if (f.entity) conds.push(eq(a.entity, f.entity));
  if (f.verb) conds.push(sql`split_part(${a.action}, '.', 2) = ${f.verb}`);
  if (f.from) conds.push(gte(a.createdAt, new Date(f.from + "T00:00:00")));
  if (f.to) conds.push(lte(a.createdAt, new Date(f.to + "T23:59:59.999")));
  if (f.q) conds.push(ilike(a.summary, `%${f.q.trim()}%`));
  const where = conds.length ? and(...conds) : undefined;
  const page = Math.max(1, f.page ?? 1);
  const pageSize = 50;
  const [rows, total, actors, entities] = await Promise.all([
    db.select().from(a).where(where).orderBy(desc(a.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(a).where(where),
    db.selectDistinct({ actor: a.actor }).from(a).orderBy(a.actor),
    db.selectDistinct({ entity: a.entity }).from(a).orderBy(a.entity),
  ]);
  return { rows, total: Number(total[0]?.n ?? 0), page, pageSize, actors: actors.map((x) => x.actor), entities: entities.map((x) => x.entity) };
}
