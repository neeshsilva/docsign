import { useEffect, useRef, useState } from 'react'

/** A minimal canvas-based signature pad. Exposes the drawn signature as a
 * PNG data URL via onChange, and clears itself via the Clear button. */
export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const ratio = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * ratio
    canvas.height = canvas.clientHeight * ratio
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1e2a38'
  }, [])

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const point = e.touches ? e.touches[0] : e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  function start(e) {
    e.preventDefault()
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function move(e) {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    hasInk.current = true
    setEmpty(false)
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    if (hasInk.current) {
      onChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasInk.current = false
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className="signature-pad-wrap">
      <canvas
        ref={canvasRef}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div style={{ marginTop: '0.5rem' }}>
        <button type="button" className="btn btn-secondary" onClick={clear} disabled={empty}>
          Clear
        </button>
      </div>
    </div>
  )
}
