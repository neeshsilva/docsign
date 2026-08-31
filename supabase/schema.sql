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

create policy "profiles are self-readable"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are self-updatable"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row when someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

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
  signed_at timestamptz
);

alter table public.documents enable row level security;

create policy "documents are owner-readable"
  on public.documents for select
  using (auth.uid() = owner_id);

create policy "documents are owner-insertable"
  on public.documents for insert
  with check (auth.uid() = owner_id);

create policy "documents are owner-updatable"
  on public.documents for update
  using (auth.uid() = owner_id);

-- 3. Audit log (append-only; one row per signing event)
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  signer_id uuid not null references public.profiles (id),
  signer_email text not null,
  consented boolean not null default false,
  consented_at timestamptz,
  signed_at timestamptz not null default now(),
  ip_address text,                -- client-reported; see LEGAL.md for the gap
  hash_before text,
  hash_after text
);

alter table public.audit_log enable row level security;

create policy "audit log is owner-readable"
  on public.audit_log for select
  using (auth.uid() = signer_id);

create policy "audit log is owner-insertable"
  on public.audit_log for insert
  with check (auth.uid() = signer_id);

-- 4. Free-tier usage limit: 10 signed documents per calendar month
create or replace function public.can_create_document(uid uuid)
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
    and signed_at >= date_trunc('month', now());

  return monthly_count < 10;
end;
$$ language plpgsql security definer;

-- Enforce it at the database level too, not just in the UI
create or replace function public.enforce_document_limit()
returns trigger as $$
begin
  if new.status = 'signed' and not public.can_create_document(new.owner_id) then
    raise exception 'Free plan limit reached: 10 signed documents per month';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists check_document_limit on public.documents;
create trigger check_document_limit
  before insert or update on public.documents
  for each row execute procedure public.enforce_document_limit();

-- 5. Storage bucket for signed documents (create via dashboard too, see README)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "users read their own storage objects"
  on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users write their own storage objects"
  on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
