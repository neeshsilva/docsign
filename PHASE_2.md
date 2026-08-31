# Phase 2 — Subscriptions

Not built yet. Plan, so the Phase 1 schema doesn't need to change shape
later:

1. **Stripe Checkout + Customer Portal** for subscription management.
   Requires a small server endpoint (Supabase Edge Function) to create
   Checkout sessions and to receive Stripe webhooks — Stripe secret keys
   must never live in the frontend.
2. **Webhook → Supabase**: on `checkout.session.completed` and
   `customer.subscription.updated/deleted`, an Edge Function updates the
   `profiles.plan` and `profiles.subscription_status` columns (already
   present in `schema.sql`, unused in Phase 1).
3. **Limit check update**: `can_create_document()` in `schema.sql` already
   branches on `profiles.plan` — `'free'` enforces the 10/month cap,
   `'pro'` skips it. Phase 2 just needs the webhook to flip that column.
4. **Billing UI**: a `Billing.jsx` page linking to the Stripe Customer
   Portal so users can upgrade, downgrade, or cancel.
