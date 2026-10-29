import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Spinner } from "@/src/components/ui/spinner";

// A fixed square crop frame inside a larger stage, as in Discord's image
// editor: the picture moves and scales under the frame, and what lies outside
// it is dimmed. Interaction follows zag-js's image-cropper (the machine behind
// Ark UI's ImageCropper): zoom around the pointer, pinch with pan, wheel
// captured without scrolling the page, arrow keys nudge and +/- zoom.
const OUTPUT = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;
const NUDGE = { base: 2, shift: 10, ctrl: 50 };
const STAGE_HEIGHT = 300;
const FRAME_INSET = 32;
const MAX_FRAME = 240;

type Point = { x: number; y: number };
type Size = { width: number; height: number };
// `centre` is the image pixel under the middle of the frame, so the crop
// survives the stage being resized.
type Crop = { zoom: number; centre: Point };

const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function layout(stage: Size, image: Size, crop: Crop) {
  const frame = Math.max(
    96,
    Math.min(MAX_FRAME, stage.width - FRAME_INSET * 2, stage.height - FRAME_INSET * 2),
  );
  const frameLeft = (stage.width - frame) / 2;
  const frameTop = (stage.height - frame) / 2;
  const scale = (frame / Math.min(image.width, image.height)) * crop.zoom;
  return {
    frame,
    frameLeft,
    frameTop,
    scale,
    x: frameLeft + frame / 2 - crop.centre.x * scale,
    y: frameTop + frame / 2 - crop.centre.y * scale,
  };
}

// The picture always covers the frame.
function clampCrop(stage: Size, image: Size, crop: Crop): Crop {
  const zoom = clampValue(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  const { frame, scale } = layout(stage, image, { ...crop, zoom });
  const half = frame / 2 / scale;
  return {
    zoom,
    centre: {
      x: clampValue(crop.centre.x, half, image.width - half),
      y: clampValue(crop.centre.y, half, image.height - half),
    },
  };
}

// Keeps the image pixel under `point` (stage coordinates) where it is.
function zoomAt(stage: Size, image: Size, crop: Crop, zoom: number, point?: Point): Crop {
  const before = layout(stage, image, crop);
  const anchor = point ?? {
    x: before.frameLeft + before.frame / 2,
    y: before.frameTop + before.frame / 2,
  };
  const next = clampValue(zoom, MIN_ZOOM, MAX_ZOOM);
  const imagePoint = {
    x: (anchor.x - before.x) / before.scale,
    y: (anchor.y - before.y) / before.scale,
  };
  const after = layout(stage, image, { ...crop, zoom: next });
  const x = anchor.x - imagePoint.x * after.scale;
  const y = anchor.y - imagePoint.y * after.scale;
  return clampCrop(stage, image, {
    zoom: next,
    centre: {
      x: (after.frameLeft + after.frame / 2 - x) / after.scale,
      y: (after.frameTop + after.frame / 2 - y) / after.scale,
    },
  });
}

function pan(stage: Size, image: Size, crop: Crop, delta: Point): Crop {
  const { scale } = layout(stage, image, crop);
  return clampCrop(stage, image, {
    ...crop,
    centre: { x: crop.centre.x - delta.x / scale, y: crop.centre.y - delta.y / scale },
  });
}

const centred = (image: Size): Crop => ({
  zoom: 1,
  centre: { x: image.width / 2, y: image.height / 2 },
});

async function exportCrop(img: HTMLImageElement, stage: Size, image: Size, crop: Crop) {
  const { frame, frameLeft, frameTop, scale, x, y } = layout(stage, image, crop);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser can't crop images.");
  context.imageSmoothingQuality = "high";
  const side = frame / scale;
  context.drawImage(
    img,
    (frameLeft - x) / scale,
    (frameTop - y) / scale,
    side,
    side,
    0,
    0,
    OUTPUT,
    OUTPUT,
  );
  // Browsers that can't encode WebP hand back a PNG; upload whichever we got.
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.92),
  );
  if (!blob) throw new Error("Couldn't crop this image.");
  return new File([blob], blob.type === "image/webp" ? "agent.webp" : "agent.png", {
    type: blob.type,
  });
}

/** Discord-style avatar editor: a fixed square frame, zoom slider, reset and apply. */
export function AvatarCropper({
  file,
  name,
  saving,
  onCancel,
  onSave,
}: {
  file: File | null;
  name: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (file: File) => void;
}) {
  const [src, setSrc] = useState("");
  const [image, setImage] = useState<Size | null>(null);
  const [stage, setStage] = useState<Size>({ width: 400, height: STAGE_HEIGHT });
  const [crop, setCrop] = useState<Crop>({ zoom: 1, centre: { x: 0, y: 0 } });
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const img = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ distance: number; midpoint: Point } | null>(null);
  // Native listeners read the latest values without re-binding.
  const live = useRef({ stage, image, crop });
  live.current = { stage, image, crop };

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setImage(null);
    setError("");
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useLayoutEffect(() => {
    if (!stageEl) return;
    const measure = () =>
      setStage({ width: stageEl.clientWidth, height: stageEl.clientHeight || STAGE_HEIGHT });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stageEl);
    return () => observer.disconnect();
  }, [stageEl]);

  // React's wheel handler is passive, so the page would scroll; bind our own.
  useEffect(() => {
    if (!stageEl) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { stage, image, crop } = live.current;
      if (!image) return;
      const rect = stageEl.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setCrop(zoomAt(stage, image, crop, crop.zoom * Math.exp(-event.deltaY * 0.0015), point));
    };
    stageEl.addEventListener("wheel", onWheel, { passive: false });
    return () => stageEl.removeEventListener("wheel", onWheel);
  }, [stageEl]);

  const ready = Boolean(image && src);
  const view = image ? layout(stage, image, crop) : null;
  const local = (event: { clientX: number; clientY: number }) => {
    const rect = stageEl!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && !saving && onCancel()}>
      <DialogContent className="gap-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit image</DialogTitle>
          <DialogDescription>
            Drag to reposition and use the slider to zoom. The square is what buyers see.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={setStageEl}
          role="group"
          aria-roledescription="image cropper"
          aria-label={`Crop the image for ${name || "your agent"}`}
          aria-description="Drag or use the arrow keys to move the image. Hold Shift for larger steps. Press plus or minus to zoom."
          aria-busy={ready ? undefined : true}
          tabIndex={0}
          className="relative -mx-6 touch-none overflow-hidden bg-background-deep outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          style={{ height: STAGE_HEIGHT, cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={(event) => {
            if (!image) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, local(event));
            gesture.current = pointers.current.size === 2 ? pinchState() : null;
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const previous = pointers.current.get(event.pointerId);
            if (!previous || !image) return;
            const point = local(event);
            pointers.current.set(event.pointerId, point);
            if (pointers.current.size === 2 && gesture.current) {
              const next = pinchState();
              const last = gesture.current;
              setCrop((current) => {
                const zoomed =
                  last.distance > 0
                    ? zoomAt(
                        stage,
                        image,
                        current,
                        current.zoom * (next.distance / last.distance),
                        next.midpoint,
                      )
                    : current;
                return pan(stage, image, zoomed, {
                  x: next.midpoint.x - last.midpoint.x,
                  y: next.midpoint.y - last.midpoint.y,
                });
              });
              gesture.current = next;
            } else if (pointers.current.size === 1) {
              setCrop((current) =>
                pan(stage, image, current, { x: point.x - previous.x, y: point.y - previous.y }),
              );
            }
          }}
          onPointerUp={(event) => {
            pointers.current.delete(event.pointerId);
            gesture.current = pointers.current.size === 2 ? pinchState() : null;
            if (!pointers.current.size) setDragging(false);
          }}
          onPointerCancel={(event) => {
            pointers.current.delete(event.pointerId);
            gesture.current = null;
            if (!pointers.current.size) setDragging(false);
          }}
          onKeyDown={(event) => {
            if (!image) return;
            if (event.key === "+" || event.key === "=" || event.key === "-" || event.key === "_") {
              event.preventDefault();
              const direction = event.key === "+" || event.key === "=" ? 1 : -1;
              setCrop((current) =>
                zoomAt(stage, image, current, current.zoom + ZOOM_STEP * direction),
              );
              return;
            }
            const step =
              event.ctrlKey || event.metaKey
                ? NUDGE.ctrl
                : event.shiftKey
                  ? NUDGE.shift
                  : NUDGE.base;
            // Arrow keys move the picture under the frame.
            const deltas: Record<string, Point> = {
              ArrowLeft: { x: -step, y: 0 },
              ArrowRight: { x: step, y: 0 },
              ArrowUp: { x: 0, y: -step },
              ArrowDown: { x: 0, y: step },
            };
            const delta = deltas[event.key];
            if (!delta) return;
            event.preventDefault();
            setCrop((current) => pan(stage, image, current, delta));
          }}
        >
          {src && (
            <img
              ref={img}
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none"
              style={
                image && view
                  ? {
                      position: "absolute",
                      left: view.x,
                      top: view.y,
                      width: image.width * view.scale,
                      height: image.height * view.scale,
                      maxWidth: "none",
                    }
                  : { opacity: 0 }
              }
              onLoad={(event) => {
                const size = {
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                };
                setImage(size);
                setCrop(centred(size));
              }}
              onError={() => setError("This file isn't an image we can open.")}
            />
          )}
          {view && (
            // The frame: a hole in a dim veil over the rest of the picture.
            <span
              aria-hidden="true"
              className="pointer-events-none absolute outline-2 outline-white/90"
              style={{
                left: view.frameLeft,
                top: view.frameTop,
                width: view.frame,
                height: view.frame,
                boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.62)",
              }}
            />
          )}
          {!ready && !error && (
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner className="text-primary" />
            </span>
          )}
          <span aria-live="polite" className="sr-only">
            {ready ? `Zoom ${Math.round(crop.zoom * 100)} percent` : "Loading image"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ImageIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            type="range"
            aria-label="Zoom"
            aria-valuetext={`${Math.round(crop.zoom * 100)}%`}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            disabled={!ready}
            onChange={(event) =>
              image &&
              setCrop((current) => zoomAt(stage, image, current, Number(event.target.value)))
            }
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--t-brand)]"
          />
          <ImageIcon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter className="sm:justify-between">
          <Button
            variant="link"
            className="px-0 sm:mr-auto"
            disabled={!ready || saving}
            onClick={() => image && setCrop(centred(image))}
          >
            Reset
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="ghost" disabled={saving} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              disabled={!ready || saving}
              onClick={() => {
                if (!img.current || !image) return;
                setError("");
                exportCrop(img.current, stage, image, crop)
                  .then(onSave)
                  .catch((cause: unknown) =>
                    setError(cause instanceof Error ? cause.message : "Couldn't crop this image."),
                  );
              }}
            >
              {saving && <Spinner />} Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
