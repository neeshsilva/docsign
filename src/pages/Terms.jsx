import Layout from '../components/Layout'

export default function Terms() {
  return (
    <Layout>
      <h1>Terms of Service</h1>
      <p style={{ color: 'var(--seal)' }}>
        Placeholder — replace with terms reviewed by a lawyer before launch.
        See LEGAL.md in the repo for what to cover.
      </p>
      <h3>1. What Inkline is</h3>
      <p>
        Inkline lets you upload a document and apply an electronic
        signature to it. Inkline is not a law firm and does not provide
        legal advice about whether a document or signature is appropriate
        for your situation.
      </p>
      <h3>2. Your account and plan</h3>
      <p>
        Free accounts may sign up to 10 documents per calendar month. [Add
        subscription terms here once Phase 2 payment plans ship.]
      </p>
      <h3>3. Your documents</h3>
      <p>
        You retain ownership of documents you upload. We store them to
        provide the service and keep an audit trail of signing events. See
        the Privacy Policy for retention and deletion details.
      </p>
      <h3>4. Acceptable use</h3>
      <p>
        Don't use Inkline to sign documents you don't have the right to
        sign, to impersonate someone else, or for any unlawful purpose.
      </p>
      <h3>5. Limitation of liability</h3>
      <p>[Add your liability limitation language here with legal review.]</p>
    </Layout>
  )
}
