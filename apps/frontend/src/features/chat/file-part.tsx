"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FileMessagePartProps } from "@assistant-ui/react";
import { Download, FileText } from "lucide-react";
import { AudioPlayer } from "@/src/components/assistant-ui/elements/media-player";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { downloadFile, formatBytes, streamFile } from "@/src/features/chat/files";
import { useThreadChat } from "@/src/features/chat/thread-runtime";
import { cn } from "@/src/lib/utils";

function DownloadButton({ fileId, name }: { fileId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Download ${name}`}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void downloadFile(fileId).finally(() => setBusy(false));
      }}
      className="grid size-8 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      <Download className="size-4" aria-hidden />
    </button>
  );
}

// Signed preview URLs live for minutes; refetch well before they lapse.
function ImagePreview({ fileId, name }: { fileId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const preview = useQuery({
    queryKey: ["file", fileId, "stream"],
    queryFn: () => streamFile(fileId),
    staleTime: 60_000,
  });
  const url = preview.data?.url;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!url}
        aria-label={`Preview ${name}`}
        className="group relative block size-40 overflow-hidden border border-border bg-background-deep"
      >
        {url ? (
          <img
            src={url}
            alt=""
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : (
          <span className="grid size-full place-items-center text-xs text-muted-foreground">
            {preview.isError ? "Preview unavailable" : "Loading"}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-2 sm:max-w-3xl">
          <DialogTitle className="sr-only">Preview {name}</DialogTitle>
          {url && <img src={url} alt={name} className="mx-auto max-h-[80dvh] object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

// A file in a message: buyer attachments and delivered artifacts alike.
export function FilePart({ data: fileId, mimeType, filename }: FileMessagePartProps) {
  const { files } = useThreadChat();
  const meta = files.get(fileId);
  const name = filename ?? meta?.name ?? "File";
  if (mimeType.startsWith("audio/"))
    return (
      <AudioPlayer
        title={name}
        durationMs={meta?.audio?.durationMs}
        peaks={meta?.audio?.peaks}
        loadSrc={async () => (await streamFile(fileId)).url}
        actions={<DownloadButton fileId={fileId} name={name} />}
      />
    );
  if (mimeType.startsWith("image/")) return <ImagePreview fileId={fileId} name={name} />;
  return (
    <div
      className={cn(
        "flex w-full max-w-sm items-center gap-3 border border-border bg-card p-2 pl-3",
      )}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm">{name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {meta ? formatBytes(meta.size) : mimeType}
        </span>
      </span>
      <DownloadButton fileId={fileId} name={name} />
    </div>
  );
}
