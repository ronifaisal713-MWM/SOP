"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const PRESET_PLATFORMS = [
  "Facebook",
  "Instagram",
  "LinkedIn",
  "YouTube",
  "TikTok",
  "Twitter / X",
  "Google Business Profile",
  "Website",
];

// Shown on both the client's own Profile page and the agency/staff
// Client Workspace page -- either side can add, edit, or remove a
// link, so if the client never fills it in, the agency can do it for
// them (and vice versa). "Custom" lets either side name any platform
// that isn't in the preset list.
export default function SocialLinksManager({ clientId }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [platform, setPlatform] = useState(PRESET_PLATFORMS[0]);
  const [customPlatform, setCustomPlatform] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("client_social_links")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });
    setLinks(data || []);
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    const finalPlatform = platform === "Custom" ? customPlatform.trim() : platform;
    if (!finalPlatform || !url.trim()) return;

    setSubmitting(true);
    setError("");

    const { error: insertError } = await supabase.from("client_social_links").insert({
      client_id: clientId,
      platform: finalPlatform,
      url: url.trim(),
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setCustomPlatform("");
    setUrl("");
    setPlatform(PRESET_PLATFORMS[0]);
    setShowForm(false);
    load();
  }

  async function handleRemove(id) {
    await supabase.from("client_social_links").delete().eq("id", id);
    load();
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">Social Media Links</h2>

      {loading && <p className="text-xs text-slate-400">Loading...</p>}
      {!loading && links.length === 0 && (
        <p className="text-xs text-slate-400">No social links added yet.</p>
      )}

      <div className="space-y-2">
        {links.map((link) => (
          <div
            key={link.id}
            className="flex items-center justify-between border border-slate-100 rounded-md px-3 py-2"
          >
            <div className="min-w-0">
              <span className="text-xs font-medium text-slate-600">{link.platform}</span>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand underline block truncate"
              >
                {link.url}
              </a>
            </div>
            <button
              onClick={() => handleRemove(link.id)}
              className="text-xs text-red-500 hover:underline flex-shrink-0 ml-3"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-sm text-brand hover:underline"
        >
          + Add Social Link
        </button>
      ) : (
        <form onSubmit={handleAdd} className="border border-slate-200 rounded-md p-3 space-y-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              {PRESET_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="Custom">Custom...</option>
            </select>
          </div>

          {platform === "Custom" && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Custom Platform Name
              </label>
              <input
                value={customPlatform}
                onChange={(e) => setCustomPlatform(e.target.value)}
                placeholder="e.g. Pinterest, Behance"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand-light transition disabled:opacity-60"
            >
              {submitting ? "Adding..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 text-xs font-medium hover:bg-slate-100 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
