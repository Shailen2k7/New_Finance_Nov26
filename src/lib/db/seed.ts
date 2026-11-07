import { getDb, schema } from "./index";
import { DEFAULT_CATEGORIES } from "../categories-default";

async function main() {
  const db = await getDb();
  const existing = await db.select().from(schema.settings);
  if (existing.length === 0) {
    await db.insert(schema.settings).values({ id: 1, businessName: "Migrizo", baseCurrency: "USD" });
    console.log("Created settings");
  }
  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    await db
      .insert(schema.categories)
      .values({ name: c.name, type: c.type, color: c.color, icon: c.icon, isSystem: true, sortOrder: i })
      .onConflictDoNothing();
  }
  console.log(`Seeded ${DEFAULT_CATEGORIES.length} categories`);
  const accts = await db.select().from(schema.accounts);
  if (accts.length === 0) {
    await db.insert(schema.accounts).values({ name: "Main Business Account", institution: "Bank", type: "BANK", currency: "USD" });
    console.log("Created default account");
  }
  console.log("Seed complete");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
