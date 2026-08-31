import { supabase } from './supabaseClient'

export const FREE_MONTHLY_LIMIT = 10

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
  const { data, error } = await supabase.rpc('can_create_document', { uid: userId })
  if (error) throw error
  return data
}
