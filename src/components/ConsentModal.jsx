import { useState } from 'react'

/** Records affirmative, timestamped consent to sign electronically, and to
 * receiving records electronically, before any signature is applied. This
 * is the piece ESIGN/UETA-style laws expect — see LEGAL.md. */
export default function ConsentModal({ onAgree, onCancel }) {
  const [checked, setChecked] = useState(false)

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>Before you sign</h3>
        <div className="consent-text">
          <p style={{ marginBottom: '0.75em' }}>
            By checking the box below, you agree to sign this document
            electronically and confirm that your electronic signature is
            legally binding, just as if you signed a paper copy.
          </p>
          <p style={{ marginBottom: '0.75em' }}>
            You'll be able to download a copy of the signed document for
            your own records. If you'd rather sign on paper, close this
            window and contact whoever sent you this document.
          </p>
          <p style={{ marginBottom: 0 }}>
            We record the time, your account email, and a tamper-evident
            hash of the document as part of this signature's audit trail.
          </p>
        </div>
        <label style={{ display: 'flex', gap: '0.5em', alignItems: 'flex-start', margin: '1rem 0' }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span style={{ fontSize: '0.9rem' }}>
            I consent to sign electronically and to receive records electronically.
          </span>
        </label>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-primary" disabled={!checked} onClick={onAgree}>
            Agree and continue
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
