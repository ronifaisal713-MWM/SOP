"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 100;

// Generic "attach up to 10 documents" manager, backed by the shared
// `files` table. Used on Requirements and Monthly Reports -- pass
// which foreign key column ties a file to its parent ("requirement_id"
// or "monthly_report_id").
export default function DocumentsManager({ entityColumn, entityId, folder, canManage = true }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!entityId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("files")
      .select("*")
      .eq(entityColumn, entityId)
      .order("created_at", { ascending: true });
    setFiles(data || []);
    setLoading(false);
  }

  async function handleUpload(e) {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    if (selected.length === 0) return;

    setError("");

    if (files.length + selected.length > MAX_FILES) {
      setError(`You can attach at most ${MAX_FILES} documents (currently ${files.length}).`);
      return;
    }
    const tooBig = selected.find((f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" is too large. Max size is ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    setUploading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    for (const f of selected) {
      const path = `${folder}/${crypto.randomUUID()}-${f.name}`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, f);
      if (uploadError) {
        setError(uploadError.message);
        continue;
      }
      await supabase.from("files").insert({
        [entityColumn]: entityId,
        storage_path: path,
        file_name: f.name,
        uploaded_by: user?.id || null,
      });
    }

    setUploading(false);
    load();
  }

  async function handleRemove(fileId) {
    await supabase.from("files").delete().eq("id", fileId);
    load();
  }

  function fileUrl(storagePath) {
    return supabase.storage.from("chat-attachments").getPublicUrl(storagePath).data.publicUrl;
  }

  return (
    <div>
      <p className="text-xs text-slate-400 mb-2">
        Documents ({files.length}/{MAX_FILES})
      </p>

      {loading && <p className="text-xs text-slate-400">Loading...</p>}

      <div className="space-y-1 mb-2">
        {files.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded-md px-2 py-1.5"
          >
            <a
              href={fileUrl(f.storage_path)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline truncate"
            >
              📎 {f.file_name}
            </a>
            {canManage && (
              <button
                onClick={() => handleRemove(f.id)}
                className="text-red-500 ml-2 flex-shrink-0"
                title="Remove"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!loading && files.length === 0 && <p className="text-xs text-slate-300">No documents yet.</p>}
      </div>

      {canManage && files.length < MAX_FILES && (
        <label className="text-xs text-brand hover:underline cursor-pointer">
          {uploading ? "Uploading..." : "+ Add Document(s)"}
          <input
            type="file"
            multiple
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      )}

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
