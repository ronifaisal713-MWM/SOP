"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

function isImage(fileName) {
  const ext = (fileName || "").split(".").pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function fileUrl(storagePath) {
  return supabase.storage.from("chat-attachments").getPublicUrl(storagePath).data.publicUrl;
}

// Renders a message's attachment: images inline as a thumbnail that
// opens full-size in a lightbox, everything else as a download link.
//
// Takes attachmentId rather than a pre-joined row because realtime
// INSERT payloads only carry the raw messages row -- no joined file --
// so a freshly-sent attachment had nothing to render until the chat
// was closed and reopened. Fetching by id here makes both paths work
// the same way.
export default function MessageAttachment({ attachmentId, file: initialFile, isMine }) {
  const [file, setFile] = useState(initialFile || null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (initialFile) {
      setFile(initialFile);
      return;
    }
    if (!attachmentId) return;

    supabase
      .from("files")
      .select("storage_path, file_name")
      .eq("id", attachmentId)
      .maybeSingle()
      .then(({ data }) => setFile(data || null));
  }, [attachmentId, initialFile]);

  if (!file?.storage_path) return null;

  const url = fileUrl(file.storage_path);

  if (isImage(file.file_name)) {
    return (
      <>
        <button
          onClick={() => setLightboxOpen(true)}
          className="block mt-1 rounded-md overflow-hidden border border-black/10 max-w-full"
        >
          <img
            src={url}
            alt={file.file_name || "attachment"}
            className="max-w-full max-h-48 object-cover"
            loading="lazy"
          />
        </button>
        <a
          href={url}
          download={file.file_name || true}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-[11px] underline block mt-0.5 ${isMine ? "text-white/80" : "text-slate-400"}`}
        >
          ⬇ Download
        </a>

        {lightboxOpen && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setLightboxOpen(false)}
          >
            <img
              src={url}
              alt={file.file_name || "attachment"}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 text-white text-3xl leading-none"
              title="Close"
            >
              ×
            </button>
            <a
              href={url}
              download={file.file_name || true}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-4 text-white/80 text-xs underline"
            >
              ⬇ Download
            </a>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mt-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-xs underline block ${isMine ? "" : "text-brand"}`}
      >
        📎 {file.file_name}
      </a>
      <a
        href={url}
        download={file.file_name || true}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-[11px] underline ${isMine ? "text-white/80" : "text-slate-400"}`}
      >
        ⬇ Download
      </a>
    </div>
  );
}

// Shared so chats can offer Download in the hover menu without
// duplicating the storage-url logic.
export function attachmentUrl(storagePath) {
  return storagePath ? fileUrl(storagePath) : null;
}
