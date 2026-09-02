import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'

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
 * `placements` is an array positioning every spot the signer dropped the
 * signature — the same signature may appear several times, on any number of
 * pages:
 *   [{ pageIndex, xRatio, yRatio, widthRatio, heightRatio,
 *      showSigner, showDate, rotation }, ...]
 * `showSigner` and `showDate` toggle the two caption lines under the
 * signature; both default to true when omitted. `rotation` turns the
 * signature ink clockwise by that many degrees (default 0); the caption is
 * deliberately never rotated, since it is an audit record that has to stay
 * readable.
 * Ratios are page-relative (0..1) with a top-left origin, matching the
 * on-screen preview. When the array is empty or omitted, the signature falls
 * back to a single stamp at the bottom left of the last page.
 *
 * Returns the new PDF as a Uint8Array.
 */
export async function embedSignature({
  originalPdfBytes,
  signaturePngDataUrl,
  signerEmail,
  signedAtIso,
  placements,
}) {
  const pdfDoc = await PDFDocument.load(originalPdfBytes)
  const pages = pdfDoc.getPages()

  // Embed the image and font once, then reuse them for every stamp — pdf-lib
  // shares the underlying object, so N signatures cost one image, not N.
  const pngImageBytes = await fetch(signaturePngDataUrl).then((r) => r.arrayBuffer())
  const pngImage = await pdfDoc.embedPng(pngImageBytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const spots = placements?.length ? placements : [null]

  for (const placement of spots) {
    const pageIndex =
      placement && placement.pageIndex >= 0 && placement.pageIndex < pages.length
        ? placement.pageIndex
        : pages.length - 1
    const page = pages[pageIndex]
    const { width: pageWidth, height: pageHeight } = page.getSize()

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

    const captionSize = 9
    const lineGap = 6
    const rowHeight = 12

    // Each caption line is optional: documents that already print their own
    // "Signed by" line or date field would otherwise get a duplicate stamped
    // on top. Default to showing both when the placement predates the flags.
    const showSigner = placement ? placement.showSigner !== false : true
    const showDate = placement ? placement.showDate !== false : true
    const captionRows = (showSigner ? 1 : 0) + (showDate ? 1 : 0)
    // Room needed under the ink: the rule, then one row per visible line.
    // A bare signature reserves nothing, so it is never lifted needlessly.
    const captionHeight = captionRows ? lineGap + captionRows * rowHeight + 8 : 0

    // Fit the signature inside the box without distorting it, and centre it.
    const sigDims = pngImage.scaleToFit(boxWidth, boxHeight)
    const sigX = boxX + (boxWidth - sigDims.width) / 2
    // The caption always sits directly below the signature, anchored to the
    // ink rather than the placement box — the signature is centred in the
    // box, so anchoring to the box would leave the caption floating well
    // beneath a tall one. Near the bottom of the page there may not be room
    // for the caption, so lift the signature (and the caption with it) just
    // enough to fit. Earlier this flipped the caption above the signature,
    // which collided with both the ink and the page text underneath.
    const sigY = Math.max(boxY + (boxHeight - sigDims.height) / 2, captionHeight)

    // `rotation` is clockwise on screen (CSS `rotate(Ndeg)`), but PDF angles
    // run anticlockwise, so the sign flips to keep the output matching the
    // preview the signer approved.
    const rotation = placement?.rotation ?? 0

    if (rotation) {
      // pdf-lib rotates about the image's bottom-left corner, not its centre,
      // so drawing at (sigX, sigY) with a rotation would swing the signature
      // away from where it was placed. Work out where the centre needs to be
      // and back-solve the corner: rotate the centre-to-corner vector by the
      // same angle and subtract it.
      const radians = (-rotation * Math.PI) / 180
      const cx = sigX + sigDims.width / 2
      const cy = sigY + sigDims.height / 2
      const dx = -sigDims.width / 2
      const dy = -sigDims.height / 2
      const cos = Math.cos(radians)
      const sin = Math.sin(radians)

      page.drawImage(pngImage, {
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos,
        width: sigDims.width,
        height: sigDims.height,
        rotate: degrees(-rotation),
      })
    } else {
      page.drawImage(pngImage, {
        x: sigX,
        y: sigY,
        width: sigDims.width,
        height: sigDims.height,
      })
    }

    if (captionRows === 0) continue

    const lineY = sigY - lineGap

    page.drawLine({
      start: { x: boxX, y: lineY },
      end: { x: boxX + boxWidth, y: lineY },
      thickness: 0.5,
      color: rgb(0.4, 0.4, 0.4),
    })

    // Rows stack downward from the rule, so hiding the signer line moves the
    // date up into its place rather than leaving a gap.
    let rowY = lineY - 14
    if (showSigner) {
      page.drawText(`Signed by ${signerEmail}`, {
        x: boxX,
        y: rowY,
        size: captionSize,
        font,
        color: rgb(0.2, 0.2, 0.2),
      })
      rowY -= rowHeight
    }
    if (showDate) {
      page.drawText(`${signedAtIso}`, {
        x: boxX,
        y: rowY,
        size: captionSize,
        font,
        color: rgb(0.4, 0.4, 0.4),
      })
    }
  }

  return pdfDoc.save()
}
