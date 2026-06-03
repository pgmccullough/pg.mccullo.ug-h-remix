/**
 * ImageCropModal — pick an image, pan + zoom it inside a fixed-ratio
 * viewport, then export the visible region as a File at a target pixel
 * size.
 *
 * Self-contained (no library deps). Pan via mouse / touch drag, zoom
 * via wheel or slider. The viewport is always full-bleed: whatever
 * fills the frame IS what gets saved (no separate crop rectangle to
 * drag around). Pan is clamped so the image always covers the viewport.
 *
 *   <ImageCropModal
 *     open
 *     aspect={1}          // 1 for square (profile), 16/9 for cover
 *     outputWidth={1600}  // final canvas pixel width
 *     fileNamePrefix="images/user/profile/"  // becomes the File name
 *     onCropped={(file) => doUpload(file)}
 *     onClose={() => setOpen(false)}
 *   />
 *
 * `onCropped` is called with a File whose name has the prefix slashes
 * preserved — the existing upload pipeline replaces slashes with
 * underscores before posting, then back to slashes server-side, so the
 * caller is responsible for that conversion (Header.tsx already does
 * exactly this via its `s3Upload` helper).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

interface Props {
  open: boolean;
  aspect: number;
  outputWidth: number;
  /** S3 key prefix (with trailing slash). Final filename will be
   *  `${prefix}<uuid>.jpg`. */
  fileNamePrefix: string;
  /** Output JPEG quality 0-1 (default 0.92). */
  quality?: number;
  onCropped: (file: File) => void;
  onClose: () => void;
}

const VIEWPORT_WIDTH = 360;

export const ImageCropModal: React.FC<Props> = ({
  open,
  aspect,
  outputWidth,
  fileNamePrefix,
  quality = 0.92,
  onCropped,
  onClose,
}) => {
  const viewportH = Math.round(VIEWPORT_WIDTH / aspect);

  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  // baseScale = the scale at which the image just covers the viewport;
  // zoom (1-5) multiplies it. So effective scale = baseScale * zoom.
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset everything when the modal closes so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      setImageEl(null);
      setImageSrc(null);
      setBaseScale(1);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setDragging(false);
      dragStart.current = null;
    }
  }, [open]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // When a new image loads, fit it (cover-mode) and center.
  const onImageLoad = useCallback((img: HTMLImageElement) => {
    const bs = Math.max(VIEWPORT_WIDTH / img.naturalWidth, viewportH / img.naturalHeight);
    const w = img.naturalWidth * bs;
    const h = img.naturalHeight * bs;
    setImageEl(img);
    setBaseScale(bs);
    setZoom(1);
    setPan({
      x: (VIEWPORT_WIDTH - w) / 2,
      y: (viewportH - h) / 2,
    });
  }, [viewportH]);

  // Pick a file → read as data URL → spin up an Image to get its
  // natural dimensions → set state.
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result;
      if (typeof src !== "string") return;
      setImageSrc(src);
      const img = new Image();
      img.onload = () => onImageLoad(img);
      img.src = src;
    };
    reader.readAsDataURL(f);
  };

  // Clamp pan so the image always covers the viewport.
  const clampPan = useCallback(
    (px: number, py: number, scale: number, img: HTMLImageElement) => {
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      const minX = Math.min(0, VIEWPORT_WIDTH - w);
      const maxX = 0;
      const minY = Math.min(0, viewportH - h);
      const maxY = 0;
      // If image is smaller than viewport on an axis, lock it centered.
      const x = w <= VIEWPORT_WIDTH
        ? (VIEWPORT_WIDTH - w) / 2
        : Math.max(minX, Math.min(maxX, px));
      const y = h <= viewportH
        ? (viewportH - h) / 2
        : Math.max(minY, Math.min(maxY, py));
      return { x, y };
    },
    [viewportH]
  );

  // Re-clamp pan when zoom changes (image may have grown past or shrunk
  // below current pan bounds).
  useEffect(() => {
    if (!imageEl) return;
    setPan((prev) => clampPan(prev.x, prev.y, baseScale * zoom, imageEl));
  }, [zoom, imageEl, baseScale, clampPan]);

  // Drag handlers — unified across mouse + touch via pointer events.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!imageEl) return;
    setDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
    dragStart.current = {
      mx: e.clientX,
      my: e.clientY,
      px: pan.x,
      py: pan.y,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragStart.current || !imageEl) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setPan(
      clampPan(
        dragStart.current.px + dx,
        dragStart.current.py + dy,
        baseScale * zoom,
        imageEl
      )
    );
  };
  const onPointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    dragStart.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!imageEl) return;
    // Negative deltaY = scroll up = zoom in.
    const next = Math.max(1, Math.min(5, zoom + (-e.deltaY) * 0.002));
    setZoom(next);
  };

  // Crop + export. Render the viewport's visible image rectangle to a
  // canvas at the target output size, then convert to a JPEG Blob.
  const onSave = () => {
    if (!imageEl) return;
    const scale = baseScale * zoom;
    // Source rectangle (in image-natural coords) that's currently visible.
    const sx = -pan.x / scale;
    const sy = -pan.y / scale;
    const sw = VIEWPORT_WIDTH / scale;
    const sh = viewportH / scale;

    const outW = outputWidth;
    const outH = Math.round(outputWidth / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // White background under translucent PNGs so JPEG export is clean.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(imageEl, sx, sy, sw, sh, 0, 0, outW, outH);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const name = `${fileNamePrefix}${uuidv4()}.jpg`;
        const file = new File([blob], name, { type: "image/jpeg" });
        onCropped(file);
      },
      "image/jpeg",
      quality
    );
  };

  if (!open) return null;

  return (
    <>
      <style>{`
        .imgCrop__backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.55);
          z-index: 1000;
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .imgCrop__modal {
          background: #fff;
          border-radius: 8px;
          width: 100%;
          max-width: ${VIEWPORT_WIDTH + 48}px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.25);
          font-family: 'PGM Sans', sans-serif;
        }
        .imgCrop__header {
          padding: 12px 16px;
          background: #eee;
          border-radius: 8px 8px 0 0;
          font-weight: 600;
          color: #506982;
          display: flex; align-items: center; justify-content: space-between;
        }
        .imgCrop__close {
          background: transparent; border: 0;
          color: #888; font-size: 22px; line-height: 1;
          cursor: pointer; padding: 0 4px; height: auto;
        }
        .imgCrop__body { padding: 16px; }
        .imgCrop__viewport {
          position: relative;
          width: ${VIEWPORT_WIDTH}px;
          height: ${viewportH}px;
          margin: 0 auto;
          background: #222;
          overflow: hidden;
          border-radius: 4px;
          cursor: ${imageEl ? (dragging ? "grabbing" : "grab") : "default"};
          user-select: none;
          touch-action: none;
        }
        .imgCrop__viewport img {
          position: absolute;
          top: 0;
          left: 0;
          transform-origin: top left;
          pointer-events: none;
          /* No transition during drag — feels sluggish otherwise. */
        }
        .imgCrop__empty {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          color: #aaa; font-size: 13px;
          text-align: center; padding: 16px;
        }
        .imgCrop__overlay {
          position: absolute; inset: 0;
          pointer-events: none;
          box-shadow: 0 0 0 2px #fff inset;
          border-radius: 4px;
        }
        .imgCrop__controls {
          margin-top: 12px;
          display: flex; gap: 12px; align-items: center;
        }
        .imgCrop__zoom {
          flex: 1; min-width: 0;
        }
        .imgCrop__zoom input[type=range] {
          width: 100%;
        }
        .imgCrop__pick,
        .imgCrop__pick:visited {
          display: inline-block;
          padding: 6px 14px;
          background: #fff;
          color: #4A6CBA;
          border: 1px solid #979997;
          border-radius: 4px;
          cursor: pointer;
          font: 600 13px 'PGM Sans', sans-serif;
          height: auto;
        }
        .imgCrop__pick:hover { background: #f3f3f3; }
        .imgCrop__footer {
          padding: 12px 16px;
          border-top: 1px solid #eee;
          display: flex; justify-content: flex-end; gap: 8px;
        }
        .imgCrop__btn,
        .imgCrop__btn:visited {
          height: auto;
          padding: 8px 18px;
          background: #4A6CBA;
          color: #fff;
          font: 600 13px 'PGM Sans', sans-serif;
          border: 0;
          border-radius: 4px;
          cursor: pointer;
          letter-spacing: 0.02em;
        }
        .imgCrop__btn:hover:not(:disabled) { background: #506982; box-shadow: 0 0 0 3px #ccc; }
        .imgCrop__btn:disabled { opacity: 0.5; cursor: default; }
        .imgCrop__btn--ghost { background: #fff; color: #4A6CBA; border: 1px solid #979997; }
        .imgCrop__btn--ghost:hover:not(:disabled) { background: #f3f3f3; box-shadow: none; }
      `}</style>

      <div className="imgCrop__backdrop" onClick={onClose}>
        <div className="imgCrop__modal" onClick={(e) => e.stopPropagation()}>
          <div className="imgCrop__header">
            <span>Upload image</span>
            <button
              className="imgCrop__close"
              type="button"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="imgCrop__body">
            <div
              className="imgCrop__viewport"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
            >
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt=""
                  draggable={false}
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${baseScale * zoom})`,
                  }}
                />
              ) : (
                <div className="imgCrop__empty">
                  Pick an image below to start.
                </div>
              )}
              {imageEl ? <div className="imgCrop__overlay" /> : null}
            </div>

            <div className="imgCrop__controls">
              <label className="imgCrop__pick" htmlFor="imgCrop-file">
                {imageSrc ? "Choose another…" : "Choose image…"}
              </label>
              <input
                id="imgCrop-file"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileChange}
                style={{ display: "none" }}
              />
              <div className="imgCrop__zoom">
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.01}
                  value={zoom}
                  disabled={!imageEl}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  aria-label="Zoom"
                />
              </div>
            </div>
          </div>
          <div className="imgCrop__footer">
            <button
              type="button"
              className="imgCrop__btn imgCrop__btn--ghost"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="imgCrop__btn"
              onClick={onSave}
              disabled={!imageEl}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
