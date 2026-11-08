import type { Config } from "@netlify/functions";

/** Every 4 minutes, wake the site's server and database connection so the first click of the day is not slow. */
export default async () => {
  const base = process.env.URL;
  if (!base) return new Response("no site URL", { status: 200 });
  try {
    const res = await fetch(`${base}/api/health`, { headers: { "user-agent": "migrizo-keep-warm" } });
    return new Response(`health ${res.status}`, { status: 200 });
  } catch {
    return new Response("health unreachable", { status: 200 });
  }
};

export const config: Config = { schedule: "*/4 * * * *" };
