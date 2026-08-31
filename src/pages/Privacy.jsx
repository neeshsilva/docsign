import Layout from '../components/Layout'

export default function Privacy() {
  return (
    <Layout>
      <h1>Privacy Policy</h1>
      <p style={{ color: 'var(--seal)' }}>
        Placeholder — replace with a policy reviewed by a lawyer before
        launch, matching what the app actually does. See LEGAL.md.
      </p>
      <h3>What we collect</h3>
      <p>
        Your email address (for sign-in), documents you upload, the
        signatures you apply, and an audit trail for each signature
        (timestamp, IP address, and a hash of the document).
      </p>
      <h3>Why we collect it</h3>
      <p>
        To operate the signing service and to provide evidence that a
        document was signed by you and not altered afterward.
      </p>
      <h3>Who can access it</h3>
      <p>
        You, and our infrastructure provider (Supabase) which stores the
        data on our behalf under its own data processing terms. [Add any
        other subprocessors here, e.g. Stripe once Phase 2 ships.]
      </p>
      <h3>How long we keep it</h3>
      <p>[Add your retention period — e.g. "for as long as your account is active, plus 90 days."]</p>
      <h3>Your rights</h3>
      <p>
        You can request a copy of your data or ask us to delete your
        account and associated documents by contacting [add contact
        method].
      </p>
    </Layout>
  )
}
