import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

const DEFAULT_BOX = { widthRatio: 0.28, heightRatio: 0.09 }
const MIN_RATIO = 0.06

/**
 * Renders the PDF and lets the signer drop their signature anywhere on any
 * page. Placement is reported in page-relative ratios (0..1, origin top-left)
 * so it stays correct regardless of the zoom used for preview.
 *
 * placement: { pageIndex, xRatio, yRatio, widthRatio, heightRatio }
 */
export default function SignaturePlacer({ file, signatureDataUrl, placement, onChange }) {
  const [pages, setPages] = useState([])
  const [loadError, setLoadError] = useState('')
  const [drag, setDrag] = useState(null)
  const pageRefs = useRef([])

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

  /** Place (or move) the box so its centre sits under the pointer. */
  function placeAt(pageIndex, clientX, clientY, box) {
    const el = pageRefs.current[pageIndex]
    if (!el) return
    const rect = el.getBoundingClientRect()
    const w = box?.widthRatio ?? placement?.widthRatio ?? DEFAULT_BOX.widthRatio
    const h = box?.heightRatio ?? placement?.heightRatio ?? DEFAULT_BOX.heightRatio
    const xRatio = clamp((clientX - rect.left) / rect.width - w / 2, 0, 1 - w)
    const yRatio = clamp((clientY - rect.top) / rect.height - h / 2, 0, 1 - h)
    onChange({ pageIndex, xRatio, yRatio, widthRatio: w, heightRatio: h })
  }

  function handlePageClick(e, pageIndex) {
    if (drag) return
    placeAt(pageIndex, e.clientX, e.clientY)
  }

  const onPointerMove = useCallback(
    (e) => {
      if (!drag) return
      const el = pageRefs.current[drag.pageIndex]
      if (!el) return
      const rect = el.getBoundingClientRect()

      if (drag.mode === 'move') {
        const xRatio = clamp(
          (e.clientX - rect.left - drag.offsetX) / rect.width,
          0,
          1 - placement.widthRatio,
        )
        const yRatio = clamp(
          (e.clientY - rect.top - drag.offsetY) / rect.height,
          0,
          1 - placement.heightRatio,
        )
        onChange({ ...placement, xRatio, yRatio })
      } else {
        const widthRatio = clamp(
          (e.clientX - rect.left) / rect.width - placement.xRatio,
          MIN_RATIO,
          1 - placement.xRatio,
        )
        // Keep the box's on-screen proportions stable while resizing.
        const aspect = placement.heightRatio / placement.widthRatio
        const heightRatio = clamp(widthRatio * aspect, MIN_RATIO, 1 - placement.yRatio)
        onChange({ ...placement, widthRatio, heightRatio })
      }
    },
    [drag, placement, onChange],
  )

  useEffect(() => {
    if (!drag) return
    const stop = () => setDrag(null)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stop)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stop)
    }
  }, [drag, onPointerMove])

  function startMove(e, pageIndex) {
    e.stopPropagation()
    e.preventDefault()
    const rect = pageRefs.current[pageIndex].getBoundingClientRect()
    setDrag({
      mode: 'move',
      pageIndex,
      offsetX: e.clientX - rect.left - placement.xRatio * rect.width,
      offsetY: e.clientY - rect.top - placement.yRatio * rect.height,
    })
  }

  function startResize(e, pageIndex) {
    e.stopPropagation()
    e.preventDefault()
    setDrag({ mode: 'resize', pageIndex })
  }

  if (loadError) return <p className="error-text">{loadError}</p>
  if (!pages.length) return <p style={{ color: 'var(--slate)' }}>Rendering document…</p>

  return (
    <div className="pdf-placer">
      <p className="placer-hint">
        Click anywhere on a page to drop your signature there. Drag it to fine-tune, or pull the
        corner handle to resize.
      </p>

      {pages.map((page, i) => (
        <div key={i} className="pdf-page-wrap">
          <div className="pdf-page-label">Page {i + 1}</div>
          <div
            className="pdf-page"
            ref={(el) => (pageRefs.current[i] = el)}
            onClick={(e) => handlePageClick(e, i)}
            style={{ aspectRatio: `1 / ${page.aspect}` }}
          >
            <img src={page.dataUrl} alt={`Page ${i + 1}`} draggable={false} />

            {placement?.pageIndex === i && (
              <div
                className="sig-box"
                style={{
                  left: `${placement.xRatio * 100}%`,
                  top: `${placement.yRatio * 100}%`,
                  width: `${placement.widthRatio * 100}%`,
                  height: `${placement.heightRatio * 100}%`,
                }}
                onPointerDown={(e) => startMove(e, i)}
              >
                {signatureDataUrl ? (
                  <img src={signatureDataUrl} alt="Your signature" draggable={false} />
                ) : (
                  <span className="sig-box-placeholder">Signature</span>
                )}
                <span className="sig-box-handle" onPointerDown={(e) => startResize(e, i)} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
