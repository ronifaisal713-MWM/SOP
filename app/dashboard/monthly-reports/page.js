"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { ALL_STAFF_ROLES, categoryForRole } from "@/lib/roleCategory";

const MAX_FILE_SIZE_MB = 100;

function monthLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function MonthlyReportsPage() {
  const { user, checked } = useRequireAuth();
  const [role, setRole] = useState(null);
  const [category, setCategory] = useState(null);

  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientId, setClientId] = useState(null); // resolved client_id for the client role

  const [reports, setReports] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New report form state
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [reportMonth, setReportMonth] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!checked || !user) return;
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user]);

  async function init() {
    setLoading(true);

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const myRole = profile?.role || null;
    setRole(myRole);
    const cat = categoryForRole(myRole);
    setCategory(cat);

    if (cat === "client") {
      const { data: clientUser } = await supabase
        .from("client_users")
        .select("client_id")
        .eq("id", user.id)
        .maybeSingle();
      const cid = clientUser?.client_id || null;
      setClientId(cid);
      if (cid) await loadReports(cid, cat);
      setLoading(false);
      return;
    }

    // Agency / Staff: RLS already limits this to clients they can access.
    const { data: clientRows } = await supabase.from("clients").select("id, company_name");
    setClients(clientRows || []);
    if (clientRows && clientRows.length > 0) {
      setSelectedClientId(clientRows[0].id);
      await loadReports(clientRows[0].id, cat);
    }
    setLoading(false);
  }

  async function loadReports(forClientId, cat) {
    const { data, error: fetchError } = await supabase
      .from("monthly_reports")
      .select("*")
      .eq("client_id", forClientId)
      .order("report_month", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const rows = data || [];
    setReports(rows);

    if (cat !== "client") {
      const ids = [...new Set([...rows.map((r) => r.created_by), ...rows.map((r) => r.deleted_by)].filter(Boolean))];
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const map = {};
        (profiles || []).forEach((p) => (map[p.id] = p.full_name));
        setProfileMap(map);
      }
    }
  }

  async function handleClientChange(newClientId) {
    setSelectedClientId(newClientId);
    setLoading(true);
    await loadReports(newClientId, category);
    setLoading(false);
  }

  async function handleSubmitReport(e) {
    e.preventDefault();
    if (!title.trim() || !reportMonth) return;

    setSubmitting(true);
    setError("");

    let storagePath = null;
    let fileName = null;
    if (file) {
      const path = `reports/${selectedClientId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (uploadError) {
        setError(uploadError.message);
        setSubmitting(false);
        return;
      }
      storagePath = path;
      fileName = file.name;
    }

    const { error: insertError } = await supabase.from("monthly_reports").insert({
      client_id: selectedClientId,
      title: title.trim(),
      report_month: `${reportMonth}-01`,
      description: description.trim() || null,
      storage_path: storagePath,
      file_name: fileName,
      created_by: user.id,
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setTitle("");
    setReportMonth("");
    setDescription("");
    setFile(null);
    setShowForm(false);
    await loadReports(selectedClientId, category);
  }

  async function handleDelete(reportId) {
    if (!confirm("Delete this report? Staff/Agency will still see who deleted it.")) return;

    await supabase
      .from("monthly_reports")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq("id", reportId);

    await loadReports(category === "client" ? clientId : selectedClientId, category);
  }

  function fileUrl(storagePath) {
    return supabase.storage.from("chat-attachments").getPublicUrl(storagePath).data.publicUrl;
  }

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  const isStaffOrAgency = category === "agency" || category === "staff";

  return (
    <main className="px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand">Monthly Reports</h1>
            <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
              ← Back to dashboard
            </a>
          </div>

          {isStaffOrAgency && clients.length > 0 && (
            <select
              value={selectedClientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {category === "client" && !clientId && (
          <p className="text-sm text-slate-400">No client account linked to this login.</p>
        )}

        {isStaffOrAgency && clients.length === 0 && (
          <p className="text-sm text-slate-400">No clients to report on yet.</p>
        )}

        {isStaffOrAgency && selectedClientId && (
          <div className="mb-6">
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition"
              >
                + Add Monthly Report
              </button>
            ) : (
              <form
                onSubmit={handleSubmitReport}
                className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3"
              >
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Title *</label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. SEO & Social Media Performance"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Month *</label>
                  <input
                    type="month"
                    required
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Summary</label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What was done this month..."
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Attach File (optional)
                  </label>
                  <input
                    type="file"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] || null;
                      if (selected && selected.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                        setError(`File is too large. Max size is ${MAX_FILE_SIZE_MB}MB.`);
                        e.target.value = "";
                        return;
                      }
                      setError("");
                      setFile(selected);
                    }}
                    className="text-sm"
                  />
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-60"
                  >
                    {submitting ? "Submitting..." : "Submit Report"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 rounded-md border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-100 transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {error && !showForm && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="space-y-3">
          {reports.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
              No reports yet.
            </div>
          )}

          {reports.map((r) => {
            const isDeleted = !!r.deleted_at;
            return (
              <div
                key={r.id}
                className={`bg-white border rounded-lg p-4 shadow-sm ${
                  isDeleted ? "border-red-200 opacity-70" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-800">
                      {r.title}
                      {isDeleted && (
                        <span className="ml-2 text-xs text-red-500 font-normal">(Deleted)</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{monthLabel(r.report_month)}</p>
                  </div>
                  {isStaffOrAgency && !isDeleted && (
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-xs text-red-500 hover:underline flex-shrink-0"
                    >
                      Delete
                    </button>
                  )}
                </div>

                {r.description && (
                  <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{r.description}</p>
                )}

                {r.storage_path && !isDeleted && (
                  <a
                    href={fileUrl(r.storage_path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand underline block mt-2"
                  >
                    📎 {r.file_name}
                  </a>
                )}

                {isStaffOrAgency && (
                  <p className="text-xs text-slate-400 mt-2">
                    Submitted by {profileMap[r.created_by] || "Unknown"}
                    {isDeleted && r.deleted_by && (
                      <> · Deleted by {profileMap[r.deleted_by] || "Unknown"}</>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
