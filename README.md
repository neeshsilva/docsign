# Inkline — Document Upload & E-Signature

A small SaaS for uploading a document and collecting a legally-attributable
electronic signature on it. Phase 1 ships a free tier (10 signed documents
per calendar month per account). Phase 2 adds paid subscriptions via Stripe
for unlimited documents — the schema and code already leave room for it
(see `PHASE_2.md`).

**Read `LEGAL.md` before you launch this for real users.** This project
gives you the mechanics (consent screen, audit trail, tamper-evident hash),
not legal advice, and it has not been reviewed by a lawyer.

## Stack

- **Frontend**: React + Vite, hosted on **GitHub Pages** (this repo)
- **Backend**: [Supabase](https://supabase.com) — Postgres database, auth
  (magic-link email), and file storage. Supabase's free tier is enough to
  run this at small scale.
- **PDF handling**: [pdf-lib](https://pdf-lib.js.org/), done client-side —
  the browser embeds the signature image and metadata into the PDF and
  computes a SHA-256 hash before uploading the signed file.

GitHub Pages only serves static files, so Supabase is what gives you a real
database, authentication, and secure storage — without it this would just
be a signature doodle pad with no accounts, no persistence, and no audit
trail.

## Project layout

```
src/
  lib/            supabase client, PDF signing helpers, usage-limit checks
  context/        auth context (current user/session)
  pages/          Login, Dashboard, SignDocument, Terms, Privacy
  components/     ConsentModal, SignaturePad, UsageBadge, Layout
supabase/
  schema.sql      tables + row-level security policies + usage-limit function
  README.md       step-by-step Supabase project setup
.github/workflows/deploy.yml   builds and publishes to GitHub Pages on push
```

## Setup

1. **Create a Supabase project** at supabase.com (free tier).
   Follow `supabase/README.md` to run `supabase/schema.sql` and create the
   `documents` storage bucket.

2. **Copy environment variables**

   ```bash
   cp .env.example .env
   ```

   Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your
   Supabase project's Settings → API page.

3. **Install and run locally**

   ```bash
   npm install
   npm run dev
   ```

4. **Set the same two variables as GitHub Actions secrets** (repo →
   Settings → Secrets and variables → Actions) so the deploy workflow can
   build with them:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

5. **Enable GitHub Pages**: repo → Settings → Pages → Source: "GitHub
   Actions". Push to `main` and the included workflow builds and deploys
   automatically.

6. Update `vite.config.js`'s `base` path to match your repo name
   (`/your-repo-name/`) if you're deploying to
   `https://<user>.github.io/<repo-name>/`. If you're using a custom domain
   or a `<user>.github.io` root repo, set `base: '/'`.

## Free tier limit

Each account can create up to **10 signed documents per calendar month**.
This is enforced twice: in the UI (so people see their usage and get a
clear message when they hit the cap) and in the database (a Postgres
function checks the count before allowing an insert, so the limit holds
even if someone bypasses the UI). See `supabase/schema.sql`.

## What this does NOT do yet (Phase 2)

- No payments — see `PHASE_2.md` for the Stripe subscription plan.
- No ID-verified signing (just email-authenticated signing — this affects
  what legal tier of e-signature you're offering, see `LEGAL.md`).
- No server-captured IP address for the audit log (the client reports its
  own IP via a public lookup, which is a real gap — see `LEGAL.md`).
