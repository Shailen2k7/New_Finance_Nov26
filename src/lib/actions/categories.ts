"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "../db";
import { recordAudit } from "../audit";

const CategoryInput = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["INCOME", "EXPENSE"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(40).optional(),
});
export type CategoryInputT = z.infer<typeof CategoryInput>;

export async function upsertCategory(raw: CategoryInputT, id?: string) {
  const input = CategoryInput.parse(raw);
  const db = await getDb();
  const values = { name: input.name.trim(), type: input.type, color: input.color, icon: input.icon || "tag" };
  if (id) {
    const before = await db.query.categories.findFirst({ where: eq(schema.categories.id, id) });
    const [after] = await db.update(schema.categories).set(values).where(eq(schema.categories.id, id)).returning();
    await recordAudit({ action: "category.update", entity: "category", entityId: id, summary: `Edited category "${values.name}"`, before, after });
  } else {
    const [row] = await db.insert(schema.categories).values(values).returning();
    await recordAudit({ action: "category.create", entity: "category", entityId: row.id, summary: `Added ${row.type.toLowerCase()} category "${row.name}"`, after: row });
  }
  revalidatePath("/categories");
  revalidatePath("/transactions");
  return { ok: true as const };
}

export async function deleteCategory(id: string) {
  const db = await getDb();
  const before = await db.query.categories.findFirst({ where: eq(schema.categories.id, id) });
  await db.delete(schema.categories).where(eq(schema.categories.id, id));
  await recordAudit({ action: "category.delete", entity: "category", entityId: id, summary: `Deleted category "${before?.name ?? id}"`, before });
  revalidatePath("/categories");
  revalidatePath("/transactions");
  return { ok: true as const };
}
