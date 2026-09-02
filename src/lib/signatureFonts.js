/** The ten script faces offered for typed signatures.
 *
 * `family` must match a font loaded in index.html exactly — canvas silently
 * falls back to a default face for an unknown family, which would produce a
 * signature that does not look like the one the signer picked.
 *
 * `scale` compensates for the very different cap heights these faces have at
 * the same nominal px size, so every option looks about the same weight in the
 * picker and in the PDF. `baseline` nudges faces whose descenders would
 * otherwise be clipped by the trim.
 */
export const SIGNATURE_FONTS = [
  { id: 'dancing', label: 'Dancing Script', family: '"Dancing Script"', weight: 600, scale: 1.0 },
  { id: 'greatvibes', label: 'Great Vibes', family: '"Great Vibes"', weight: 400, scale: 1.05 },
  { id: 'sacramento', label: 'Sacramento', family: '"Sacramento"', weight: 400, scale: 1.15 },
  { id: 'allura', label: 'Allura', family: '"Allura"', weight: 400, scale: 1.1 },
  { id: 'parisienne', label: 'Parisienne', family: '"Parisienne"', weight: 400, scale: 1.05 },
  { id: 'dehaviland', label: 'Mr De Haviland', family: '"Mr De Haviland"', weight: 400, scale: 1.15 },
  { id: 'alexbrush', label: 'Alex Brush', family: '"Alex Brush"', weight: 400, scale: 1.1 },
  { id: 'yellowtail', label: 'Yellowtail', family: '"Yellowtail"', weight: 400, scale: 0.95 },
  { id: 'homemade', label: 'Homemade Apple', family: '"Homemade Apple"', weight: 400, scale: 0.8 },
  { id: 'caveat', label: 'Caveat', family: '"Caveat"', weight: 600, scale: 1.05 },
]

/** Nominal size the signature is drawn at before trimming. Large enough that
 * the embedded PNG stays sharp when pdf-lib scales it into a placement box. */
const BASE_PX = 120
const INK = '#1e2a38'

/** Wait for a face to actually be available. Canvas does not trigger webfont
 * loading and does not wait for it: drawing before the face has arrived
 * renders the fallback with no error. */
export async function ensureFontLoaded(font) {
  if (!document.fonts?.load) return
  const spec = `${font.weight} ${BASE_PX}px ${font.family}`
  try {
    await document.fonts.load(spec, 'Signature')
    await document.fonts.ready
  } catch {
    // A font that fails to load still renders in a fallback face. That is
    // worse than ideal but not worth blocking signing over.
  }
}

/** Render `name` in `font` to a trimmed PNG data URL, or null if the name is
 * blank or produced no visible ink.
 *
 * The result is trimmed to the ink bounds on purpose: pdfSigning scales the
 * PNG to fill its placement box, so any transparent padding baked in here
 * would shrink the signature inside that box by the same amount.
 */
export async function renderTypedSignature(name, font, { ratio = 2 } = {}) {
  const text = name.trim()
  if (!text) return null

  await ensureFontLoaded(font)

  const px = BASE_PX * (font.scale ?? 1)
  const measure = document.createElement('canvas').getContext('2d')
  measure.font = `${font.weight} ${px}px ${font.family}`
  const metrics = measure.measureText(text)

  // Script faces have long ascenders, deep descenders and swashes that
  // overhang the advance width, so pad generously before trimming rather
  // than trusting the advance width alone.
  const padX = px * 0.4
  const padY = px * 0.8
  const width = Math.ceil(metrics.width + padX * 2)
  const height = Math.ceil(px * 2 + padY)

  const canvas = document.createElement('canvas')
  canvas.width = width * ratio
  canvas.height = height * ratio
  const ctx = canvas.getContext('2d')
  ctx.scale(ratio, ratio)
  ctx.font = `${font.weight} ${px}px ${font.family}`
  ctx.fillStyle = INK
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, padX, px * 1.2)

  return trimToInk(canvas)
}

/** Crop a canvas to its non-transparent pixels and return it as a PNG data
 * URL. Returns null when the canvas is entirely blank. */
function trimToInk(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const { data } = ctx.getImageData(0, 0, width, height)

  let top = height
  let left = width
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Alpha channel of pixel (x, y) in the RGBA buffer.
      if (data[(y * width + x) * 4 + 3] === 0) continue
      if (y < top) top = y
      if (y > bottom) bottom = y
      if (x < left) left = x
      if (x > right) right = x
    }
  }

  if (right < 0) return null

  const out = document.createElement('canvas')
  out.width = right - left + 1
  out.height = bottom - top + 1
  out.getContext('2d').drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height)
  return out.toDataURL('image/png')
}
