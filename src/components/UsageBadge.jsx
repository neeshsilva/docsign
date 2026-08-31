import { FREE_MONTHLY_LIMIT } from '../lib/usage'

export default function UsageBadge({ used, plan }) {
  if (plan === 'pro') {
    return <span className="usage-badge"><strong>Unlimited</strong> — Pro plan</span>
  }
  return (
    <span className="usage-badge">
      <strong>{used} / {FREE_MONTHLY_LIMIT}</strong> signed this month
    </span>
  )
}
