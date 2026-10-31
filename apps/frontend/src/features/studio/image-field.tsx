import { useRef, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImageUp } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/ui/spinner";
import { errorMessage } from "@/src/components/layout/page-kit";
import { AvatarCropper } from "@/src/features/studio/avatar-cropper";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
// The picked file; the cropped upload is a 512px square well under the API limit.
const SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const imageErrors: Record<string, string> = {
  INVALID_IMAGE_TYPE: "Use a PNG, JPG, WebP or GIF image.",
  IMAGE_TOO_LARGE: "That image is too large.",
  PAYLOAD_TOO_LARGE: "That image is too large.",
  SOURCE_TOO_LARGE: "That image is over 10 MB.",
  FILES_DISABLED: "Image uploads aren't available on this server.",
};

/**
 * A square picture with upload, crop and remove: an agent's image in Studio,
 * an account's avatar on the profile page.
 */
export function ImageField({
  id,
  name,
  label,
  preview,
  hasImage,
  upload,
  remove,
  onDone,
}: {
  id: string;
  name: string;
  label: string;
  preview: ReactNode;
  hasImage: boolean;
  upload: (file: File) => Promise<unknown>;
  remove: () => Promise<unknown>;
  onDone: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<File | null>(null);
  const save = useMutation({
    mutationFn: upload,
    onSuccess: () => {
      setPicked(null);
      onDone();
    },
    // Close the cropper so the reason shows next to the field.
    onError: (cause) => {
      setPicked(null);
      setError(imageErrors[errorMessage(cause)] ?? errorMessage(cause));
    },
  });
  const drop = useMutation({
    mutationFn: remove,
    onSuccess: onDone,
    onError: (cause) => setError(errorMessage(cause)),
  });
  const busy = save.isPending || drop.isPending;
  return (
    <div className="flex flex-wrap items-center gap-5">
      {preview}
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {save.isPending ? <Spinner /> : <ImageUp />}
            {hasImage ? "Change image" : "Upload image"}
          </Button>
          {hasImage && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => drop.mutate()}>
              {drop.isPending && <Spinner />} Remove
            </Button>
          )}
        </div>
        <p id={`${id}-hint`} className="text-xs text-faint">
          PNG, JPG, WebP or GIF, up to 10 MB. You can crop it before it&apos;s saved.
        </p>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        aria-label={label}
        aria-describedby={`${id}-hint`}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError("");
          if (!IMAGE_TYPES.includes(file.type)) return setError(imageErrors.INVALID_IMAGE_TYPE);
          if (file.size > SOURCE_MAX_BYTES) return setError(imageErrors.SOURCE_TOO_LARGE);
          setPicked(file);
        }}
      />
      <AvatarCropper
        file={picked}
        name={name}
        saving={save.isPending}
        onCancel={() => setPicked(null)}
        onSave={(file) => save.mutate(file)}
      />
    </div>
  );
}
