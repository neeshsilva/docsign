-- Audit log integrity — run this in the Supabase SQL editor.
-- Idempotent: safe to run more than once.
--
-- The audit log is the evidence that a signature happened, so it is the
-- one table where "the client said so" is not good enough. Every row was
-- previously written straight from the browser with only an RLS check
-- that signer_id = auth.uid(), which left a signed-in user free to
-- backdate consented_at, claim a signed_at from last year, invent an
-- ip_address, or record hashes that match no file we hold. Those are
-- exactly the fields a dispute would turn on.
--
-- This migration moves each of them under the database's control.

-- 1. Overwrite the fields the client must not choose.
--
-- The trigger runs as the table owner on every insert and ignores
-- whatever the browser supplied for the attested fields. The client can
-- still choose document_id and consented — document_id is constrained
-- below, and consented is a genuine user action the browser is the only
-- one who can observe.
create or replace function public.stamp_audit_log()
returns trigger as $$
declare
  doc_owner uuid;
  doc_hash_before text;
  doc_hash_after text;
begin
  -- Identity comes from the JWT, never from the payload. signer_email is
  -- read back from profiles so a renamed account cannot be attributed to
  -- an address it never held.
  new.signer_id := auth.uid();
  select email into new.signer_email
    from public.profiles
   where id = auth.uid();

  -- Server clock and server-observed address. inet_client_addr() is the
  -- connection's peer, which for Supabase is the API gateway rather than
  -- the end user, so it is recorded as supporting detail rather than
  -- proof of the signer's location. It is still strictly better than a
  -- value the signer typed: it cannot be forged by the client.
  new.signed_at := pg_catalog.now();
  new.consented_at := case
    when new.consented then pg_catalog.now()
    else null
  end;
  new.ip_address := pg_catalog.host(pg_catalog.inet_client_addr());

  -- Hashes are copied from the documents row, which is itself written
  -- under RLS by the owner. This does not prove the hash matches the
  -- stored bytes -- only a server-side hash of the uploaded object can do
  -- that, and that needs an edge function (see the note at the bottom of
  -- this file). What it does buy is that the audit row and the document
  -- row can no longer disagree: a forged hash now has to be planted in
  -- documents, where it is visible next to the file it describes.
  select owner_id, hash_before, hash_after
    into doc_owner, doc_hash_before, doc_hash_after
    from public.documents
   where id = new.document_id;

  if doc_owner is null then
    raise exception 'audit_log.document_id does not reference an existing document';
  end if;

  -- Stops a user from attaching an audit row to somebody else's
  -- document. RLS checked the signer; nothing checked the document.
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

-- 2. Make append-only explicit.
--
-- Today nothing can update or delete a row because no policy grants it,
-- which is correct by omission -- one added policy would silently undo
-- it. Revoking the privileges outright means a future policy is not
-- enough on its own to reopen the hole.
revoke update, delete on public.audit_log from anon, authenticated;

-- 3. Reject inserts that claim consent was never given.
--
-- A row recording consented = false is not an audit trail, it is an
-- admission. The signing flow only ever writes true; anything else is
-- either a bug or someone probing.
alter table public.audit_log
  drop constraint if exists audit_log_consented_true;
alter table public.audit_log
  add constraint audit_log_consented_true check (consented);

-- Remaining gap, deliberately not closed here: hash_before and hash_after
-- still originate in the browser by way of public.documents, so a
-- determined owner can still record a hash that does not match the bytes
-- in storage. Closing that means hashing the uploaded object server-side
-- in an edge function and writing both rows from there. This migration
-- narrows the forgery surface from "any value at all" to "a value that
-- must also be planted in documents"; it does not eliminate it.
