// Authentication is a shared password with named users (see src/lib/auth.ts).
// Supabase is used for the database and file storage only.
import { getSession } from "../auth";

export const authEnabled = () => true;

export async function getCurrentUser() {
  const s = await getSession();
  return s ? { name: s.name } : null;
}
