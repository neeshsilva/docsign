# Legal notes

This is a plain-language summary to help you brief a lawyer — **it is not
legal advice**, and you should get a lawyer licensed in your jurisdiction
to review your consent flow, Terms of Service, and Privacy Policy before
you let real users sign real contracts on this.

## Why electronic signatures are legally recognized

In the US, the **ESIGN Act** (federal) and **UETA** (adopted by most
states) say an electronic signature can't be denied legal effect just
because it's electronic — provided certain conditions are met. In the EU
and UK, **eIDAS** does something similar but defines three tiers: simple,
advanced, and qualified electronic signatures, with increasing legal
weight and increasingly strict identity-verification requirements.

This project implements what's usually called a "simple" or "basic"
electronic signature: the signer draws or types a signature, checks a
consent box, and the app records who signed, when, and a hash of the
document. That's enough for a lot of everyday contracts, but it is **not**
the same legal tier as a qualified signature under eIDAS, and it will not
satisfy every use case (e.g. some real-estate transactions, wills, and
certain government filings have extra requirements or are excluded from
e-signature laws entirely in some jurisdictions).

## What's implemented here, and why

- **Consent screen before signing** (`ConsentModal.jsx`): ESIGN/UETA
  require that the signer affirmatively consent to sign electronically and
  be told they can request a paper copy. The modal records consent as its
  own timestamped event, separate from the signature itself.
- **Audit trail** (`audit_log` table): each signing event stores the
  signer's account email, a timestamp, a best-effort IP address, and the
  document's SHA-256 hash before and after signing. This is what lets you
  later prove a document wasn't altered after signing and who signed it.
- **Tamper-evidence**: the hash is computed client-side right before and
  right after the signature is embedded, so any later edit to the PDF
  changes the hash and breaks the chain — useful as evidence, not a
  cryptographic seal (see gap below).
- **Retention**: signed documents and their audit records are kept as long
  as the account is active. You need to decide and publish a retention
  policy — see the placeholder in `Privacy.jsx`.

## Real gaps to close before relying on this for real contracts

- **IP address capture is client-reported**, not server-verified. A
  motivated signer could spoof it. For stronger evidence, move IP capture
  into a Supabase Edge Function that reads the real request IP
  server-side.
- **No identity verification** beyond "controls this email inbox." If you
  need higher assurance (e.g. matching a signer to a government ID),
  that's a separate, paid identity-verification step you'd add before the
  signing screen.
- **No cryptographic digital signature** (a PKI-based signature with a
  certificate) is applied to the PDF — only a visual signature plus an
  off-document audit trail. This is normal for "simple" e-signature
  products (think early-stage DocuSign-style flows) but worth knowing.
- **Excluded document types**: check your jurisdiction's e-signature law
  for what it *doesn't* cover (commonly: wills, certain family-law
  documents, some court filings, notarized documents). Build in a warning
  or a blocklist if you expect users might try to sign these.

## Data protection

- You'll be storing personal documents and PII for paying customers. If
  you have EU/UK users, **GDPR** applies (right to access, correct, and
  delete their data; you need a lawful basis and a Data Processing
  Agreement with Supabase and any other processor). If you have California
  users, **CCPA/CPRA** applies similarly.
- Publish a **Privacy Policy** (stub in `src/pages/Privacy.jsx`) that
  states: what you collect, why, how long you keep it, who can access it
  (including Supabase as your subprocessor), and how someone requests
  deletion.
- Publish **Terms of Service** (stub in `src/pages/Terms.jsx`) covering:
  acceptable use, that you're not a law firm and don't provide legal
  advice, liability limits, and what happens to a user's documents if they
  cancel or their free-tier account goes inactive.
- Encrypt documents at rest (Supabase Storage does this by default) and in
  transit (HTTPS, which GitHub Pages and Supabase both enforce).

## Suggested next step

Before onboarding real paying users in Phase 2, have a lawyer review: the
consent flow's exact wording, the Terms of Service, the Privacy Policy,
and whether your target market's contracts fall inside or outside what
simple e-signatures can legally do.
