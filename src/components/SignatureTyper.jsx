import { useEffect, useRef, useState } from 'react'
import { SIGNATURE_FONTS, renderTypedSignature } from '../lib/signatureFonts'

/** Type a name, pick one of ten script faces, and emit the result as a PNG
 * data URL — the same shape SignaturePad emits, so nothing downstream needs
 * to know which way the signature was made. */
export default function SignatureTyper({ defaultName = '', onChange }) {
  const [name, setName] = useState(defaultName)
  const [selectedId, setSelectedId] = useState(SIGNATURE_FONTS[0].id)
  const [previews, setPreviews] = useState({})

  // Rendering all ten is a burst of canvas work on every keystroke, so it is
  // debounced. The token guards against an earlier, slower render landing
  // after a later one and showing a stale name.
  const renderToken = useRef(0)

  useEffect(() => {
    const trimmed = name.trim()
    if (!trimmed) {
      setPreviews({})
      onChange(null)
      return
    }

    const token = ++renderToken.current
    const timer = setTimeout(async () => {
      const entries = await Promise.all(
        SIGNATURE_FONTS.map(async (font) => [font.id, await renderTypedSignature(trimmed, font)]),
      )
      if (token !== renderToken.current) return

      const next = Object.fromEntries(entries)
      setPreviews(next)
      onChange(next[selectedId] ?? null)
    }, 250)

    return () => clearTimeout(timer)
    // onChange is intentionally excluded: SignDocument passes a fresh
    // setState function identity, and including it would re-render on
    // every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, selectedId])

  function choose(id) {
    setSelectedId(id)
    if (previews[id]) onChange(previews[id])
  }

  return (
    <div>
      <div className="field">
        <label htmlFor="typed-signature-name">Your full name</label>
        <input
          id="typed-signature-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex Morgan"
          autoComplete="name"
        />
      </div>

      {name.trim() && (
        <>
          <p style={{ color: 'var(--slate)', margin: '1rem 0 0.5rem' }}>
            Pick a style — this is exactly how it will appear on the document.
          </p>
          <div className="signature-style-grid">
            {SIGNATURE_FONTS.map((font) => (
              <button
                key={font.id}
                type="button"
                className={`signature-style${font.id === selectedId ? ' is-selected' : ''}`}
                onClick={() => choose(font.id)}
                aria-pressed={font.id === selectedId}
                title={font.label}
              >
                {previews[font.id] ? (
                  <img src={previews[font.id]} alt={`${name} in ${font.label}`} />
                ) : (
                  <span className="signature-style-loading">…</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
