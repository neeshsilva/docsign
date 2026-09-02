-- Free-tier limit integrity.
--
-- The 10-documents/month cap was enforced by a trigger that trusted two
-- things the browser supplies: `signed_at` and the insert/update ordering.
--
-- Bypass 1 — backdating. can_create_document() counts rows whose
-- `signed_at` falls in the current month. `signed_at` arrived from the
-- client, so a signed-in user could insert documents dated last month and
-- never be counted at all:
--   supabase.from('documents').insert({ ..., status: 'signed',
--                                       signed_at: '2020-01-01' })
--
-- Bypass 2 — ordering. Inserting as 'draft' skips the check (the trigger
-- only fires its raise when new.status = 'signed'). Flipping the row to
-- 'signed' afterwards re-runs the check, but the count is taken before the
-- update lands, so it trails one behind and the cap is off by one per
-- draft staged in advance.
--
-- Both are fixed the same way the audit log was: stop accepting the
-- fields the decision depends on.

-- 1. Stamp `signed_at` server-side. A document becomes signed at the
--    moment the database says so, not the moment the browser claims.
create or replace function public.stamp_document_signed_at()
returns trigger as $$
begin
  if new.status = 'signed' then
    -- On update, keep the original timestamp if the row was already
    -- signed; only a draft-to-signed transition sets a new one.
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

-- 2. Count the row being written, not just the rows already committed.
--    The limit trigger asks "may this account sign another?" while the
--    new row is still invisible to the count, so the answer was always
--    one too generous. Excluding the current row by id and comparing
--    against `< limit` keeps the arithmetic honest on both insert and
--    the draft-to-signed update.
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
    return true;
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

-- 3. The limit trigger must also pin its search_path — it was the one
--    security-definer-adjacent function left unpinned, and it calls
--    can_create_document() by unqualified name.
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

-- The stamping trigger must run before the limit check, otherwise the
-- check counts a row whose signed_at has not been normalised yet.
-- Postgres fires same-timing triggers in name order, so
-- "check_document_limit" would sort before "stamp_document_signed_at".
-- Recreate the check under a name that sorts after it.
drop trigger if exists check_document_limit on public.documents;
drop trigger if exists zz_check_document_limit on public.documents;
create trigger zz_check_document_limit
  before insert or update on public.documents
  for each row execute procedure public.enforce_document_limit();

-- 4. Close the owner-reassignment gap on update: without `with check`,
--    an update may set owner_id to another account, moving a document
--    (and its usage) onto someone else's ledger.
drop policy if exists "documents are owner-updatable" on public.documents;
create policy "documents are owner-updatable"
  on public.documents for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 5. Users have no business setting these directly. Revoking the
--    column-level privilege makes the trigger's authority explicit.
revoke update on public.documents from anon, authenticated;
grant update (file_name, status, storage_path) on public.documents to authenticated;
