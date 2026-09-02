# Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is
   fine to start).
2. Go to **SQL Editor** → paste the contents of `schema.sql` → Run.
   This creates the `profiles`, `documents`, and `audit_log` tables, sets
   up row-level security so users can only see their own data, adds the
   10-document/month enforcement function, and creates a `documents`
   storage bucket.
   *Already deployed before the security fixes landed?* Also paste
   `migrations/001_security_hardening.sql` and Run. It stops users from
   granting themselves the Pro plan, pins `search_path` on the
   `security definer` functions, and caps the storage bucket at 25 MiB /
   PDF-only. Then paste `migrations/002_audit_log_integrity.sql` and Run:
   it makes the database stamp the signer, timestamps, IP and hashes on
   every audit row instead of trusting the browser, and locks the table to
   inserts only. Then `migrations/003_usage_limit_integrity.sql`: it stamps
   `signed_at` server-side, fixes an off-by-one that let the free-tier
   limit be walked past, and drops the one-argument
   `can_create_document(uuid)` that 001 created — leaving both signatures
   in place makes the app's `rpc()` call ambiguous (PostgREST `PGRST203`).
   All three are idempotent, so running them twice is harmless.
3. Go to **Authentication → Providers** and make sure **Email** is
   enabled. This app uses magic-link (passwordless) sign-in.
4. Go to **Authentication → URL Configuration** and add your GitHub Pages
   URL (e.g. `https://yourusername.github.io/your-repo/`) to the **Site
   URL** and **Redirect URLs** — otherwise the magic-link email will
   redirect somewhere Supabase blocks.
5. Go to **Settings → API** and copy the **Project URL** and **anon
   public key** into your `.env` file (see root `README.md`).
6. (Optional, recommended) Go to **Storage → documents bucket → Policies**
   and confirm the two policies from `schema.sql` are present — the SQL
   above creates them, but it's worth eyeballing them in the dashboard.
