-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  Bootstrap Migration                                                       ║
-- ║                                                                             ║
-- ║  Creates schemas, enables extensions, and installs helper functions         ║
-- ║  that Drizzle ORM cannot manage (it only handles tables/indexes/enums).    ║
-- ║                                                                             ║
-- ║  After this migration runs, `drizzle-kit push` creates the actual tables.  ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ─── Schemas ─────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS kortix;
CREATE SCHEMA IF NOT EXISTS basejump;

-- ─── Schema Permissions ─────────────────────────────────────────────────────
-- Supabase PostgREST requires USAGE on a schema before it can query tables
-- in that schema via .schema('kortix'). Without this, queries silently return
-- null even if table-level SELECT is granted.
GRANT USAGE ON SCHEMA kortix TO anon;
GRANT USAGE ON SCHEMA kortix TO authenticated;
GRANT USAGE ON SCHEMA kortix TO service_role;
