import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { canCreateDocument } from '../lib/usage'
import { sha256Hex, embedSignature } from '../lib/pdfSigning'
import Layout from '../components/Layout'
import SignaturePad from '../components/SignaturePad'
import SignaturePlacer from '../components/SignaturePlacer'
import ConsentModal from '../components/ConsentModal'

const STEPS = { PICK_FILE: 'pick', DRAW_SIGN: 'sign', PLACE_SIGN: 'place', DONE: 'done' }

export default function SignDocument() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [step, setStep] = useState(STEPS.PICK_FILE)
  const [file, setFile] = useState(null)
  const [signatureDataUrl, setSignatureDataUrl] = useState(null)
  const [placement, setPlacement] = useState(null)
  const [showConsent, setShowConsent] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [resultUrl, setResultUrl] = useState(null)

  async function handleFileChosen(e) {
    setError('')
    const chosen = e.target.files?.[0]
    if (!chosen) return
    if (chosen.type !== 'application/pdf') {
      setError('Please choose a PDF file.')
      return
    }

    const allowed = await canCreateDocument(user.id)
    if (!allowed) {
      setError("You've reached the free plan's 10 documents/month limit. It resets on the 1st.")
      return
    }

    setFile(chosen)
    setStep(STEPS.DRAW_SIGN)
  }

  function handleContinueToPlacement() {
    if (!signatureDataUrl) {
      setError('Draw your signature first.')
      return
    }
    setError('')
    setStep(STEPS.PLACE_SIGN)
  }

  function handleContinueToConsent() {
    if (!placement) {
      setError('Click on the document to choose where your signature goes.')
      return
    }
    setError('')
    setShowConsent(true)
  }

  async function handleAgreeAndSign() {
    setShowConsent(false)
    setWorking(true)
    setError('')

    try {
      const consentedAt = new Date().toISOString()
      const originalBytes = await file.arrayBuffer()
      const hashBefore = await sha256Hex(originalBytes.slice(0))

      const signedPdfBytes = await embedSignature({
        originalPdfBytes: originalBytes,
        signaturePngDataUrl: signatureDataUrl,
        signerEmail: user.email,
        signedAtIso: consentedAt,
        placement,
      })

      const hashAfter = await sha256Hex(signedPdfBytes.buffer.slice(0))

      const path = `${user.id}/${crypto.randomUUID()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, new Blob([signedPdfBytes], { type: 'application/pdf' }))
      if (uploadError) throw uploadError

      const { data: docRow, error: docError } = await supabase
        .from('documents')
        .insert({
          owner_id: user.id,
          file_name: file.name,
          status: 'signed',
          storage_path: path,
          hash_before: hashBefore,
          hash_after: hashAfter,
          signed_at: consentedAt,
        })
        .select()
        .single()
      if (docError) throw docError

      // Best-effort client-reported IP for the audit trail — see LEGAL.md
      // for why this should move server-side before relying on it heavily.
      let ip = null
      try {
        const res = await fetch('https://api.ipify.org?format=json')
        ip = (await res.json()).ip
      } catch {
        ip = null
      }

      const { error: auditError } = await supabase.from('audit_log').insert({
        document_id: docRow.id,
        signer_id: user.id,
        signer_email: user.email,
        consented: true,
        consented_at: consentedAt,
        signed_at: consentedAt,
        ip_address: ip,
        hash_before: hashBefore,
        hash_after: hashAfter,
      })
      if (auditError) throw auditError

      const { data: downloadData } = await supabase.storage
        .from('documents')
        .createSignedUrl(path, 60 * 60)

      setResultUrl(downloadData?.signedUrl ?? null)
      setStep(STEPS.DONE)
    } catch (err) {
      setError(err.message ?? 'Something went wrong while signing.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <Layout>
      <h1>Sign a document</h1>

      {error && <p className="error-text">{error}</p>}

      {step === STEPS.PICK_FILE && (
        <div className="card">
          <h3>1. Choose a PDF</h3>
          <p>Only PDF files are supported right now.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChosen}
          />
        </div>
      )}

      {step === STEPS.DRAW_SIGN && (
        <div className="card">
          <h3>2. Draw your signature</h3>
          <p style={{ color: 'var(--slate)' }}>File: {file?.name}</p>
          <SignaturePad onChange={setSignatureDataUrl} />
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={handleContinueToPlacement}>
              Continue
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setPlacement(null)
                setStep(STEPS.PICK_FILE)
              }}
              disabled={working}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === STEPS.PLACE_SIGN && (
        <div className="card">
          <h3>3. Place your signature</h3>
          <SignaturePlacer
            file={file}
            signatureDataUrl={signatureDataUrl}
            placement={placement}
            onChange={setPlacement}
          />
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={handleContinueToConsent} disabled={working}>
              {working ? 'Signing…' : 'Continue'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setStep(STEPS.DRAW_SIGN)}
              disabled={working}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {step === STEPS.DONE && (
        <div className="card">
          <h3>Signed</h3>
          <p>Your document has been signed and saved.</p>
          {resultUrl && (
            <a href={resultUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
              Download signed PDF
            </a>
          )}
          <div style={{ marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to dashboard
            </button>
          </div>
        </div>
      )}

      {showConsent && (
        <ConsentModal onAgree={handleAgreeAndSign} onCancel={() => setShowConsent(false)} />
      )}
    </Layout>
  )
}
