// Pure crop geometry for the import editor. No reactive/DOM deps — the page's
// reactive wrappers (importCropImageFrame / computeImportCropRect /
// seedImportCropFromExisting) just feed the live importCrop numbers in and write
// the results back. Kept pure so the crop selection ↔ stored crop mapping is
// testable and cannot silently drift (the WYSIWYG invariant, see page README).
import { clamp } from './editor-core'
import type { ImgCrop } from './editor-core'

export type CropRect = { x: number; y: number; w: number; h: number }
export type CropFrame = { x: number; y: number; w: number; h: number }

// The letterboxed rect where the image is actually drawn inside the crop stage
// (contain-fit). Falls back to sane defaults when a dimension is not measured yet.
export function cropImageFrame(stageW: number, stageH: number, imageW: number, imageH: number): CropFrame {
  const sw = stageW || 314
  const sh = stageH || 178
  const iw = imageW || sw
  const ih = imageH || sh
  const scale = Math.min(sw / iw, sh / ih)
  const w = iw * scale
  const h = ih * scale
  return { x: (sw - w) / 2, y: (sh - h) / 2, w, h }
}

// Selection rect (stage px) → normalized crop (0–1 of the image frame).
export function normalizeCropRect(sel: CropRect, frame: CropFrame): ImgCrop {
  const fw = frame.w || 1
  const fh = frame.h || 1
  const nx = clamp((sel.x - frame.x) / fw, 0, 1)
  const ny = clamp((sel.y - frame.y) / fh, 0, 1)
  const nw = clamp(sel.w / fw, 0.02, 1 - nx)
  const nh = clamp(sel.h / fh, 0.02, 1 - ny)
  return { nx, ny, nw, nh }
}

// Normalized crop → selection rect (stage px) on the current frame. Inverse of
// normalizeCropRect, used to restore a stored crop when re-opening the editor.
export function denormalizeCropRect(crop: ImgCrop, frame: CropFrame): CropRect {
  return {
    x: frame.x + crop.nx * frame.w,
    y: frame.y + crop.ny * frame.h,
    w: crop.nw * frame.w,
    h: crop.nh * frame.h,
  }
}
