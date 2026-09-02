-- Inkline schema — run this in the Supabase SQL editor.

-- 1. Profiles (mirrors auth.users, adds plan info for Phase 2)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  subscription_status text default 'inactive',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are self-readable" on public.profiles;
create policy "profiles are self-readable"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles are self-updatable" on public.profiles;
create policy "profiles are self-updatable"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users may edit their own profile row, but NOT the billing columns.
-- Without this, any signed-in user could run
--   supabase.from('profiles').update({ plan: 'pro' })
-- from the browser console and get unlimited signing for free. Only the
-- service role (used by the Phase 2 billing webhook) may set these.
revoke update on public.profiles from anon, authenticated;
grant update (email) on public.profiles to authenticated;

-- Auto-create a profile row when someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Documents (one row per uploaded/signed document)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  file_name text not null,
  status text not null default 'draft' check (status in ('draft', 'signed')),
  storage_path text,              -- signed PDF path in the "documents" bucket
  hash_before text,               -- sha256 of the uploaded file
  hash_after text,                -- sha256 of the file after signing
  created_at timestamptz not null default now(),
  signed_at timestamptz          -- server-stamped; see migration 003
);

alter table public.documents enable row level security;

drop policy if exists "documents are owner-readable" on public.documents;
create policy "documents are owner-readable"
  on public.documents for select
  using (auth.uid() = owner_id);

drop policy if exists "documents are owner-insertable" on public.documents;
create policy "documents are owner-insertable"
  on public.documents for insert
  with check (auth.uid() = owner_id);

drop policy if exists "documents are owner-updatable" on public.documents;
create policy "documents are owner-updatable"
  on public.documents for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Users may flip a document to signed or rename it, but not hand it to
-- another account or restate when it was signed. signed_at is stamped by
-- a trigger below; the free-tier count is derived from it, so a client
-- that could write it could backdate its way past the limit.
revoke update on public.documents from anon, authenticated;
grant update (file_name, status, storage_path) on public.documents to authenticated;

-- 3. Audit log (append-only; one row per signing event)
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  signer_id uuid not null references public.profiles (id),
  signer_email text not null,
  consented boolean not null default false,
  consented_at timestamptz,
  signed_at timestamptz not null default now(),
  ip_address text,                -- server-stamped; see LEGAL.md for the gap
  hash_before text,
  hash_after text
);

alter table public.audit_log enable row level security;

drop policy if exists "audit log is owner-readable" on public.audit_log;
create policy "audit log is owner-readable"
  on public.audit_log for select
  using (auth.uid() = signer_id);

drop policy if exists "audit log is owner-insertable" on public.audit_log;
create policy "audit log is owner-insertable"
  on public.audit_log for insert
  with check (auth.uid() = signer_id);

-- The audit log is the evidence a signature happened, so the fields a
-- dispute would turn on are stamped by the database, not accepted from
-- the browser. Without this a signed-in user could backdate consent,
-- invent an IP, or record hashes matching no file we hold.
create or replace function public.stamp_audit_log()
returns trigger as $$
declare
  doc_owner uuid;
  doc_hash_before text;
  doc_hash_after text;
begin
  new.signer_id := auth.uid();
  select email into new.signer_email
    from public.profiles
   where id = auth.uid();

  new.signed_at := pg_catalog.now();
  new.consented_at := case
    when new.consented then pg_catalog.now()
    else null
  end;
  new.ip_address := pg_catalog.host(pg_catalog.inet_client_addr());

  select owner_id, hash_before, hash_after
    into doc_owner, doc_hash_before, doc_hash_after
    from public.documents
   where id = new.document_id;

  if doc_owner is null then
    raise exception 'audit_log.document_id does not reference an existing document';
  end if;

  -- RLS checked the signer; nothing checked the document.
  if doc_owner <> auth.uid() then
    raise exception 'audit_log entries may only be written for your own documents';
  end if;

  new.hash_before := doc_hash_before;
  new.hash_after := doc_hash_after;

  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists stamp_audit_log on public.audit_log;
create trigger stamp_audit_log
  before insert on public.audit_log
  for each row execute procedure public.stamp_audit_log();

-- Append-only by intent rather than by omission: revoking the privilege
-- means a future policy is not enough on its own to reopen the hole.
revoke update, delete on public.audit_log from anon, authenticated;

alter table public.audit_log
  drop constraint if exists audit_log_consented_true;
alter table public.audit_log
  add constraint audit_log_consented_true check (consented);

-- 4. Free-tier usage limit: 10 signed documents per calendar month
-- signed_at decides which month a document counts against, so it is
-- stamped here rather than accepted from the browser. A draft carries no
-- timestamp; re-signing an already-signed row keeps the original.
create or replace function public.stamp_document_signed_at()
returns trigger as $$
begin
  if new.status = 'signed' then
    if tg_op = 'INSERT' or old.status <> 'signed' then
      new.signed_at := pg_catalog.now();
    else
      new.signed_at := old.signed_at;
    end if;
  else
    new.signed_at := null;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

drop trigger if exists stamp_document_signed_at on public.documents;
create trigger stamp_document_signed_at
  before insert or update on public.documents
  for each row execute procedure public.stamp_document_signed_at();

-- `exclude_id` leaves the row currently being written out of the count.
-- The limit trigger runs before the row is visible, so without it the
-- check was always one document too generous — and staging drafts and
-- flipping them to signed turned that into a repeatable bypass.
-- Migration 001 created a one-argument can_create_document(uid uuid).
-- `create or replace` with a different parameter list ADDS an overload
-- rather than replacing it, leaving two candidates — and PostgREST then
-- refuses rpc('can_create_document', { uid }) as ambiguous (PGRST203).
-- Drop the old signature explicitly. Dropping by exact signature cannot
-- touch the two-argument version below.
drop function if exists public.can_create_document(uuid);

create or replace function public.can_create_document(uid uuid, exclude_id uuid default null)
returns boolean as $$
declare
  user_plan text;
  monthly_count int;
begin
  select plan into user_plan from public.profiles where id = uid;

  if user_plan = 'pro' then
    return true; -- Phase 2: unlimited on paid plan
  end if;

  select count(*) into monthly_count
  from public.documents
  where owner_id = uid
    and status = 'signed'
    and signed_at >= pg_catalog.date_trunc('month', pg_catalog.now())
    and (exclude_id is null or id <> exclude_id);

  return monthly_count < 10;
end;
$$ language plpgsql security definer set search_path = '';

-- Enforce it at the database level too, not just in the UI
create or replace function public.enforce_document_limit()
returns trigger as $$
begin
  if new.status = 'signed'
     and not public.can_create_document(new.owner_id, new.id) then
    raise exception 'Free plan limit reached: 10 signed documents per month';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = '';

-- Named to sort after stamp_document_signed_at: Postgres fires triggers
-- of the same timing in name order, and counting before signed_at has
-- been normalised would defeat the point.
drop trigger if exists check_document_limit on public.documents;
drop trigger if exists zz_check_document_limit on public.documents;
create trigger zz_check_document_limit
  before insert or update on public.documents
  for each row execute procedure public.enforce_document_limit();

-- 5. Storage bucket for signed documents (create via dashboard too, see README)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users read their own storage objects" on storage.objects;
create policy "users read their own storage objects"
  on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users write their own storage objects" on storage.objects;
create policy "users write their own storage objects"
  on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
