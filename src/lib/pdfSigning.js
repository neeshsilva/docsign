import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

/** SHA-256 hash of an ArrayBuffer, returned as a hex string. */
export async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Embeds a signature image (PNG data URL from the signature pad) onto the
 * PDF, plus a small caption recording who signed and when.
 *
 * `placement` positions the signature where the signer dropped it:
 *   { pageIndex, xRatio, yRatio, widthRatio, heightRatio }
 * Ratios are page-relative (0..1) with a top-left origin, matching the
 * on-screen preview. When omitted, the signature falls back to the bottom
 * left of the last page.
 *
 * Returns the new PDF as a Uint8Array.
 */
export async function embedSignature({
  originalPdfBytes,
  signaturePngDataUrl,
  signerEmail,
  signedAtIso,
  placement,
}) {
  const pdfDoc = await PDFDocument.load(originalPdfBytes)
  const pages = pdfDoc.getPages()

  const pageIndex =
    placement && placement.pageIndex >= 0 && placement.pageIndex < pages.length
      ? placement.pageIndex
      : pages.length - 1
  const page = pages[pageIndex]
  const { width: pageWidth, height: pageHeight } = page.getSize()

  const pngImageBytes = await fetch(signaturePngDataUrl).then((r) => r.arrayBuffer())
  const pngImage = await pdfDoc.embedPng(pngImageBytes)

  let boxX
  let boxY
  let boxWidth
  let boxHeight

  if (placement) {
    boxWidth = placement.widthRatio * pageWidth
    boxHeight = placement.heightRatio * pageHeight
    boxX = placement.xRatio * pageWidth
    // PDF coordinates start at the bottom-left, the preview at the top-left.
    boxY = pageHeight - placement.yRatio * pageHeight - boxHeight
  } else {
    boxWidth = 180
    boxHeight = 60
    boxX = 48
    boxY = 90
  }

  // Fit the signature inside the box without distorting it, and centre it.
  const sigDims = pngImage.scaleToFit(boxWidth, boxHeight)
  const sigX = boxX + (boxWidth - sigDims.width) / 2
  const sigY = boxY + (boxHeight - sigDims.height) / 2

  page.drawImage(pngImage, {
    x: sigX,
    y: sigY,
    width: sigDims.width,
    height: sigDims.height,
  })

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const captionSize = 9
  const captionHeight = 32
  // Caption normally sits under the signature; if there isn't room at the
  // bottom of the page, put it above so it never runs off the edge.
  const captionBelow = boxY - captionHeight >= 0
  const lineY = captionBelow ? boxY - 6 : boxY + boxHeight + captionHeight - 6

  page.drawLine({
    start: { x: boxX, y: lineY },
    end: { x: boxX + boxWidth, y: lineY },
    thickness: 0.5,
    color: rgb(0.4, 0.4, 0.4),
  })
  page.drawText(`Signed by ${signerEmail}`, {
    x: boxX,
    y: lineY - 14,
    size: captionSize,
    font,
    color: rgb(0.2, 0.2, 0.2),
  })
  page.drawText(`${signedAtIso}`, {
    x: boxX,
    y: lineY - 26,
    size: captionSize,
    font,
    color: rgb(0.4, 0.4, 0.4),
  })

  return pdfDoc.save()
}
