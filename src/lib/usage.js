import { supabase } from './supabaseClient'

export const FREE_MONTHLY_LIMIT = 10

/** Mirrors the `documents` bucket's file_size_limit in supabase/schema.sql.
 * The bucket is the real limit — this copy exists so an oversized PDF is
 * rejected before the browser spends time hashing and rasterising it. Change
 * one and you must change the other. */
export const MAX_FILE_BYTES = 26214400 // 25 MiB

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

/** Count of documents this account has signed since the start of this
 * calendar month. Used to render "3 / 10 used this month" in the UI. */
export async function getMonthlySignedCount(userId) {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('status', 'signed')
    .gte('signed_at', startOfMonth.toISOString())

  if (error) throw error
  return count ?? 0
}

/** Ask the database directly whether this account may sign another
 * document. The database also enforces this on insert regardless of what
 * the UI does — this call is just so we can show a clear message before
 * the user does the work of uploading and signing. */
export async function canCreateDocument(userId) {
  // Both arguments are named on purpose. Migration 001 shipped a one-argument
  // can_create_document(uuid) and 003 replaced it with a two-argument version;
  // a database where 003 has not been run yet has both, and a one-argument call
  // matches both candidates, which PostgREST rejects as ambiguous (PGRST203).
  // Naming exclude_id matches only the two-argument function either way.
  const { data, error } = await supabase.rpc('can_create_document', {
    uid: userId,
    exclude_id: null,
  })
  if (error) throw error
  return data
}
