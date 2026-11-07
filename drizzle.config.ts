import { defineConfig } from "drizzle-kit";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default url
  ? defineConfig({
      dialect: "postgresql",
      schema: "./src/lib/db/schema.ts",
      out: "./drizzle",
      dbCredentials: { url },
    })
  : defineConfig({
      dialect: "postgresql",
      driver: "pglite",
      schema: "./src/lib/db/schema.ts",
      out: "./drizzle",
      dbCredentials: { url: "./data/pglite" },
    });
