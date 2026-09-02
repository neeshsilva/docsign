-- Security hardening — run this in the Supabase SQL editor against an
-- existing Inkline database. Idempotent: safe to run more than once.
--
-- Fresh installs get all of this from schema.sql already; this file is
-- only for projects deployed before these fixes landed.

-- 1. Stop users from granting themselves the Pro plan.
--
-- The original "profiles are self-updatable" policy had no column
-- restriction, so any signed-in user could run
--   supabase.from('profiles').update({ plan: 'pro' })
-- from the browser console and sign unlimited documents for free
-- (can_create_document returns true unconditionally when plan = 'pro').
drop policy if exists "profiles are self-updatable" on public.profiles;

create policy "profiles are self-updatable"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.profiles from anon, authenticated;
grant update (email) on public.profiles to authenticated;

-- 2. Pin search_path on the security definer functions.
--
-- A security definer function with a mutable search_path can be hijacked
-- by a caller who creates a shadowing object in an earlier schema; the
-- shadowed code then runs as the function owner. Pinning to '' forces
-- every reference to be fully qualified.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = '';

create or replace function public.can_create_document(uid uuid)
returns boolean as $$
declare
  user_plan text;
  monthly_count int;
begin
  select plan into user_plan from public.profiles where id = uid;

  if user_plan = 'pro' then
    return true;
  end if;

  select count(*) into monthly_count
  from public.documents
  where owner_id = uid
    and status = 'signed'
    and signed_at >= pg_catalog.date_trunc('month', pg_catalog.now());

  return monthly_count < 10;
end;
$$ language plpgsql security definer set search_path = '';

-- 3. Cap what can be written to the documents bucket.
--
-- The bucket was created with no size or type limit, so any authenticated
-- user could fill the storage quota with arbitrary files under their own
-- prefix. 25 MiB, PDFs only.
update storage.buckets
   set file_size_limit = 26214400,
       allowed_mime_types = array['application/pdf']
 where id = 'documents';
