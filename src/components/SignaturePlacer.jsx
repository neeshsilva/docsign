import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const DEFAULT_BOX = { widthRatio: 0.28, heightRatio: 0.09 }
const MIN_RATIO = 0.06
const ROTATE_STEP = 10

let nextId = 1
const makeId = () => `sig-${nextId++}`

/**
 * Renders the PDF and lets the signer drop their signature anywhere on any
 * page, as many times as they like. Each placement is reported in
 * page-relative ratios (0..1, origin top-left) so it stays correct regardless
 * of the zoom used for preview.
 *
 * placements: [{ id, pageIndex, xRatio, yRatio, widthRatio, heightRatio,
 *               rotation }, ...]
 */
export default function SignaturePlacer({
  file,
  signatureDataUrl,
  signerEmail,
  placements,
  onChange,
}) {
  const [pages, setPages] = useState([])
  const [loadError, setLoadError] = useState('')
  const [drag, setDrag] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const pageRefs = useRef([])
  // Set on pointerup after a drag so the trailing click can be ignored.
  const justDragged = useRef(false)

  useEffect(() => {
    let cancelled = false
    const canvases = []

    async function render() {
      try {
        const bytes = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
        if (cancelled) return

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          if (cancelled) return
          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
          if (cancelled) return
          canvases.push({
            dataUrl: canvas.toDataURL('image/png'),
            aspect: viewport.height / viewport.width,
          })
          setPages([...canvases])
        }
      } catch (err) {
        if (!cancelled) setLoadError(err?.message ?? 'Could not render this PDF for preview.')
      }
    }

    render()
    return () => {
      cancelled = true
    }
  }, [file])

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

  const list = placements ?? []

  /** Replace one placement by id, leaving the rest untouched. */
  const updateOne = useCallback(
    (id, patch) => onChange(list.map((p) => (p.id === id ? { ...p, ...patch } : p))),
    [list, onChange],
  )

  function removeOne(id) {
    onChange(list.filter((p) => p.id !== id))
    setSelectedId((current) => (current === id ? null : current))
  }

  /** Turn a signature by one step. Positive is clockwise, matching the
   * on-screen arrow. The angle is normalised into 0..359 so repeated taps
   * wrap around instead of growing without bound, which would make the
   * readout ("350°") unhelpful and the stored value unbounded. */
  function rotateOne(box, degrees) {
    const next = (((box.rotation ?? 0) + degrees) % 360 + 360) % 360
    updateOne(box.id, { rotation: next })
  }

  /** Drop a new signature box centred under the pointer. */
  function addAt(pageIndex, clientX, clientY) {
    const el = pageRefs.current[pageIndex]
    if (!el) return
    const rect = el.getBoundingClientRect()
    // New boxes inherit the size of the last one placed, so a signer who
    // resized once doesn't have to redo it on every subsequent page.
    const last = list[list.length - 1]
    const w = last?.widthRatio ?? DEFAULT_BOX.widthRatio
    const h = last?.heightRatio ?? DEFAULT_BOX.heightRatio
    const xRatio = clamp((clientX - rect.left) / rect.width - w / 2, 0, 1 - w)
    const yRatio = clamp((clientY - rect.top) / rect.height - h / 2, 0, 1 - h)
    const id = makeId()
    onChange([
      ...list,
      {
        id,
        pageIndex,
        xRatio,
        yRatio,
        widthRatio: w,
        heightRatio: h,
        // Inherit the caption choices too — a signer who turned the date off
        // once almost certainly wants it off on every other page as well.
        showSigner: last?.showSigner ?? true,
        showDate: last?.showDate ?? true,
        rotation: last?.rotation ?? 0,
      },
    ])
    setSelectedId(id)
  }

  function handlePageClick(e, pageIndex) {
    // Clicks that started on an existing box bubble up to the page. Adding a
    // new signature for those would mean every drag, resize or option toggle
    // silently spawned a duplicate, so only bare-page clicks count.
    if (e.target !== e.currentTarget && !e.target.classList.contains('pdf-page-img')) return
    // A drag ends with pointerup, which clears `drag` before the click event
    // is dispatched — so `drag` is already null here and cannot be the guard.
    if (justDragged.current) {
      justDragged.current = false
      return
    }
    addAt(pageIndex, e.clientX, e.clientY)
  }

  const onPointerMove = useCallback(
    (e) => {
      if (!drag) return
      const el = pageRefs.current[drag.pageIndex]
      if (!el) return
      const target = list.find((p) => p.id === drag.id)
      if (!target) return
      const rect = el.getBoundingClientRect()

      if (drag.mode === 'move') {
        const xRatio = clamp(
          (e.clientX - rect.left - drag.offsetX) / rect.width,
          0,
          1 - target.widthRatio,
        )
        const yRatio = clamp(
          (e.clientY - rect.top - drag.offsetY) / rect.height,
          0,
          1 - target.heightRatio,
        )
        updateOne(drag.id, { xRatio, yRatio })
      } else {
        const widthRatio = clamp(
          (e.clientX - rect.left) / rect.width - target.xRatio,
          MIN_RATIO,
          1 - target.xRatio,
        )
        // Keep the box's on-screen proportions stable while resizing.
        const aspect = target.heightRatio / target.widthRatio
        const heightRatio = clamp(widthRatio * aspect, MIN_RATIO, 1 - target.yRatio)
        updateOne(drag.id, { widthRatio, heightRatio })
      }
    },
    [drag, list, updateOne],
  )

  useEffect(() => {
    if (!drag) return
    const stop = () => {
      // Remember that a drag just finished; the click that follows pointerup
      // must not be read as "add a signature here".
      justDragged.current = true
      setDrag(null)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stop)
    }
  }, [drag, onPointerMove])

  function startMove(e, box) {
    e.stopPropagation()
    e.preventDefault()
    const rect = pageRefs.current[box.pageIndex].getBoundingClientRect()
    setSelectedId(box.id)
    setDrag({
      mode: 'move',
      id: box.id,
      pageIndex: box.pageIndex,
      offsetX: e.clientX - rect.left - box.xRatio * rect.width,
      offsetY: e.clientY - rect.top - box.yRatio * rect.height,
    })
  }

  function startResize(e, box) {
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(box.id)
    setDrag({ mode: 'resize', id: box.id, pageIndex: box.pageIndex })
  }

  /**
   * Copy every placement on this page onto all the other pages, replacing
   * whatever those pages had. Signing the same block on every page is the
   * common case for contracts, and doing it by hand is tedious.
   */
  function applyPageToAll(pageIndex) {
    const source = list.filter((p) => p.pageIndex === pageIndex)
    if (!source.length) return
    const copies = []
    for (let i = 0; i < pages.length; i++) {
      if (i === pageIndex) continue
      for (const p of source) {
        copies.push({ ...p, id: makeId(), pageIndex: i })
      }
    }
    onChange([...source, ...copies])
  }

  if (loadError) return <p className="error-text">{loadError}</p>
  if (!pages.length) return <p style={{ color: 'var(--slate)' }}>Rendering document…</p>

  const countByPage = (i) => list.filter((p) => p.pageIndex === i).length
  // Stand-in for the real signing timestamp, which is only fixed at consent.
  const previewDate = new Date().toISOString()

  return (
    <div className="pdf-placer">
      <div className="placer-bar">
        <p className="placer-hint">
          Click anywhere on a page to drop a signature there — add as many as you need, on any
          number of pages. Drag one to fine-tune, pull its corner to resize, or hit × to remove it.
          Select a signature to turn its “Signed by” line or date off — useful when the document
          already prints its own — or to rotate it in {ROTATE_STEP}° steps either way.
        </p>
        <div className="placer-actions">
          <span className="placer-count">
            {list.length} signature{list.length === 1 ? '' : 's'} placed
          </span>
          {list.length > 0 && (
            <button type="button" className="btn-link" onClick={() => onChange([])}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {pages.map((page, i) => (
        <div key={i} className="pdf-page-wrap">
          <div className="pdf-page-label">
            <span>
              Page {i + 1}
              {countByPage(i) > 0 && ` — ${countByPage(i)} signature${countByPage(i) === 1 ? '' : 's'}`}
            </span>
            {countByPage(i) > 0 && pages.length > 1 && (
              <button type="button" className="btn-link" onClick={() => applyPageToAll(i)}>
                Copy to all pages
              </button>
            )}
          </div>
          <div
            className="pdf-page"
            ref={(el) => (pageRefs.current[i] = el)}
            onClick={(e) => handlePageClick(e, i)}
            style={{ aspectRatio: `1 / ${page.aspect}` }}
          >
            <img className="pdf-page-img" src={page.dataUrl} alt={`Page ${i + 1}`} draggable={false} />

            {list
              .filter((box) => box.pageIndex === i)
              .map((box) => (
                <div
                  key={box.id}
                  className={`sig-box${selectedId === box.id ? ' is-selected' : ''}`}
                  style={{
                    left: `${box.xRatio * 100}%`,
                    top: `${box.yRatio * 100}%`,
                    width: `${box.widthRatio * 100}%`,
                    height: `${box.heightRatio * 100}%`,
                  }}
                  onPointerDown={(e) => startMove(e, box)}
                >
                  {/* Only the ink turns. The caption is an audit record —
                      rotating "Signed by ..." along with a 40-degree
                      signature would leave it unreadable. */}
                  {signatureDataUrl ? (
                    <img
                      src={signatureDataUrl}
                      alt="Your signature"
                      draggable={false}
                      style={
                        box.rotation ? { transform: `rotate(${box.rotation}deg)` } : undefined
                      }
                    />
                  ) : (
                    <span className="sig-box-placeholder">Signature</span>
                  )}
                  <button
                    type="button"
                    className="sig-box-remove"
                    aria-label={`Remove signature on page ${i + 1}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeOne(box.id)
                    }}
                  >
                    ×
                  </button>
                  <span className="sig-box-handle" onPointerDown={(e) => startResize(e, box)} />

                  {(box.showSigner || box.showDate) && (
                    <div className="sig-box-caption">
                      {box.showSigner && <span>Signed by {signerEmail}</span>}
                      {box.showDate && <span className="sig-box-caption-date">{previewDate}</span>}
                    </div>
                  )}

                  {selectedId === box.id && (
                    <div
                      className="sig-box-options"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={box.showSigner !== false}
                          onChange={(e) => updateOne(box.id, { showSigner: e.target.checked })}
                        />
                        Signed by
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={box.showDate !== false}
                          onChange={(e) => updateOne(box.id, { showDate: e.target.checked })}
                        />
                        Date
                      </label>
                      <span className="sig-box-rotate">
                        <button
                          type="button"
                          aria-label={`Rotate anticlockwise ${ROTATE_STEP} degrees`}
                          title={`Rotate anticlockwise ${ROTATE_STEP}°`}
                          onClick={() => rotateOne(box, -ROTATE_STEP)}
                        >
                          ↺
                        </button>
                        <button
                          type="button"
                          aria-label={`Rotate clockwise ${ROTATE_STEP} degrees`}
                          title={`Rotate clockwise ${ROTATE_STEP}°`}
                          onClick={() => rotateOne(box, ROTATE_STEP)}
                        >
                          ↻
                        </button>
                        <button
                          type="button"
                          className="sig-box-angle"
                          aria-label="Reset rotation"
                          title="Reset to 0°"
                          onClick={() => updateOne(box.id, { rotation: 0 })}
                        >
                          {box.rotation ?? 0}°
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
