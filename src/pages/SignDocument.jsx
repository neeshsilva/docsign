import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { canCreateDocument, MAX_FILE_BYTES, formatBytes } from '../lib/usage'
import { sha256Hex, embedSignature } from '../lib/pdfSigning'
import Layout from '../components/Layout'
import SignaturePad from '../components/SignaturePad'
import SignatureTyper from '../components/SignatureTyper'
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
  const [placements, setPlacements] = useState([])
  const [showConsent, setShowConsent] = useState(false)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [checking, setChecking] = useState(false)
  const [sigMode, setSigMode] = useState('type')
  const [resultUrl, setResultUrl] = useState(null)

  async function handleFileChosen(e) {
    setError('')
    const chosen = e.target.files?.[0]
    if (!chosen) return
    if (chosen.type !== 'application/pdf') {
      setError('Please choose a PDF file.')
      return
    }
    // Check the size before anything reads the file. Signing renders every
    // page to a canvas and hashes the bytes twice, so an oversized PDF would
    // otherwise lock the tab up for a while and only fail at upload, once
    // the storage bucket rejects it.
    if (chosen.size > MAX_FILE_BYTES) {
      setError(
        `That file is ${formatBytes(chosen.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`,
      )
      return
    }

    // The limit check is a courtesy: it tells the user now rather than after
    // they have drawn and placed a signature. The database enforces the same
    // limit on insert, so if this check cannot run we let them through rather
    // than stranding them on this step -- an unreachable check must not be
    // the thing that stops someone signing.
    setChecking(true)
    try {
      const allowed = await canCreateDocument(user.id)
      if (!allowed) {
        setError("You've reached the free plan's 10 documents/month limit. It resets on the 1st.")
        return
      }
    } catch (err) {
      console.error('Could not check the monthly document limit:', err)
    } finally {
      setChecking(false)
    }

    setFile(chosen)
    setStep(STEPS.DRAW_SIGN)
  }

  // Switching methods clears the signature. The two modes each own their own
  // canvas, so keeping the old image would leave the user looking at a blank
  // pad while a signature they can no longer see is what gets embedded.
  function switchSigMode(mode) {
    if (mode === sigMode) return
    setSignatureDataUrl(null)
    setError('')
    setSigMode(mode)
  }

  function handleContinueToPlacement() {
    if (!signatureDataUrl) {
      setError(
        sigMode === 'type'
          ? 'Type your name and pick a style first.'
          : 'Draw your signature first.',
      )
      return
    }
    setError('')
    setStep(STEPS.PLACE_SIGN)
  }

  function handleContinueToConsent() {
    if (!placements.length) {
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
        placements,
      })

      const hashAfter = await sha256Hex(signedPdfBytes.buffer.slice(0))

      const path = `${user.id}/${crypto.randomUUID()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, new Blob([signedPdfBytes], { type: 'application/pdf' }))
      if (uploadError) throw uploadError

      // signed_at is stamped by a database trigger, not sent from here:
      // the free-tier count is derived from it, so a client that could
      // write it could backdate its way past the monthly limit.
      const { data: docRow, error: docError } = await supabase
        .from('documents')
        .insert({
          owner_id: user.id,
          file_name: file.name,
          status: 'signed',
          storage_path: path,
          hash_before: hashBefore,
          hash_after: hashAfter,
        })
        .select()
        .single()
      if (docError) throw docError

      // Only document_id and consent travel from the browser. The signer,
      // both timestamps, the IP and the hashes are stamped by a database
      // trigger — sending them from here would be theatre, since anything
      // the client can set, the client can forge.
      const { error: auditError } = await supabase.from('audit_log').insert({
        document_id: docRow.id,
        consented: true,
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
          <p>Only PDF files are supported right now, up to {formatBytes(MAX_FILE_BYTES)}.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChosen}
            disabled={checking}
          />
          {checking && <p style={{ color: 'var(--slate)' }}>Checking your plan…</p>}
        </div>
      )}

      {step === STEPS.DRAW_SIGN && (
        <div className="card">
          <h3>2. Create your signature</h3>
          <p style={{ color: 'var(--slate)' }}>File: {file?.name}</p>

          <div className="sig-mode-tabs" role="tablist" aria-label="Signature method">
            <button
              type="button"
              role="tab"
              aria-selected={sigMode === 'type'}
              className={`sig-mode-tab${sigMode === 'type' ? ' is-active' : ''}`}
              onClick={() => switchSigMode('type')}
            >
              Type it
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sigMode === 'draw'}
              className={`sig-mode-tab${sigMode === 'draw' ? ' is-active' : ''}`}
              onClick={() => switchSigMode('draw')}
            >
              Draw it
            </button>
          </div>

          {sigMode === 'type' ? (
            <SignatureTyper
              defaultName={user.user_metadata?.full_name ?? ''}
              onChange={setSignatureDataUrl}
            />
          ) : (
            <SignaturePad onChange={setSignatureDataUrl} />
          )}
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn btn-primary"
              onClick={handleContinueToPlacement}
              disabled={!signatureDataUrl}
            >
              Continue
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setPlacements([])
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
            signerEmail={user.email}
            placements={placements}
            onChange={setPlacements}
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
