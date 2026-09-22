"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { categoryForRole } from "@/lib/roleCategory";
import DocumentsManager from "@/components/DocumentsManager";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getYearMonth(dateStr) {
  const d = new Date(dateStr);
  return { year: d.getFullYear(), month: d.getMonth() }; // month: 0-11
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

  // Folder navigation
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [openMonth, setOpenMonth] = useState(null); // 0-11, or null = folder grid

  // New report form state
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [reportMonth, setReportMonth] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState([]);
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
    setOpenMonth(null);
    setLoading(true);
    await loadReports(newClientId, category);
    setLoading(false);
  }

  async function handleSubmitReport(e) {
    e.preventDefault();
    if (!title.trim() || !reportMonth) return;

    setSubmitting(true);
    setError("");

    const { data: newReport, error: insertError } = await supabase
      .from("monthly_reports")
      .insert({
        client_id: selectedClientId,
        title: title.trim(),
        report_month: `${reportMonth}-01`,
        description: description.trim() || null,
        created_by: user.id,
      })
      .select()
      .single();

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (files.length > 0) {
      for (const f of files) {
        const path = `reports/${selectedClientId}/${crypto.randomUUID()}-${f.name}`;
        const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, f);
        if (uploadError) continue;
        await supabase.from("files").insert({
          monthly_report_id: newReport.id,
          storage_path: path,
          file_name: f.name,
          uploaded_by: user.id,
        });
      }
    }

    // Jump straight to the folder this report landed in.
    const [yStr, mStr] = reportMonth.split("-");
    setSelectedYear(parseInt(yStr, 10));
    setOpenMonth(parseInt(mStr, 10) - 1);

    setTitle("");
    setReportMonth("");
    setDescription("");
    setFiles([]);
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

  function openAddForm(prefillMonthIndex) {
    if (prefillMonthIndex != null) {
      const mm = String(prefillMonthIndex + 1).padStart(2, "0");
      setReportMonth(`${selectedYear}-${mm}`);
    }
    setShowForm(true);
  }

  // ---- Derived: years present in the data (plus the current year) ----
  const availableYears = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    reports.forEach((r) => years.add(getYearMonth(r.report_month).year));
    return Array.from(years).sort((a, b) => b - a);
  }, [reports]);

  // ---- Derived: reports grouped by month for the selected year ----
  const reportsByMonth = useMemo(() => {
    const grouped = Array.from({ length: 12 }, () => []);
    reports.forEach((r) => {
      const { year, month } = getYearMonth(r.report_month);
      if (year === selectedYear) grouped[month].push(r);
    });
    return grouped;
  }, [reports, selectedYear]);

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  const isStaffOrAgency = category === "agency" || category === "staff";
  const monthReports = openMonth != null ? reportsByMonth[openMonth] : [];

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

        {(category !== "client" || clientId) && (
          <>
            {/* Year switcher */}
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setSelectedYear((y) => y - 1)}
                className="text-slate-400 hover:text-brand px-2"
              >
                ←
              </button>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="border border-slate-300 rounded-md px-3 py-1.5 text-sm font-medium"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSelectedYear((y) => y + 1)}
                className="text-slate-400 hover:text-brand px-2"
              >
                →
              </button>
            </div>

            {openMonth === null ? (
              // ---- Folder grid: one "folder" per month ----
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {MONTH_NAMES.map((name, idx) => {
                  const count = reportsByMonth[idx].filter((r) => !r.deleted_at || isStaffOrAgency).length;
                  return (
                    <button
                      key={name}
                      onClick={() => setOpenMonth(idx)}
                      className="bg-white border border-slate-200 rounded-lg p-4 text-left shadow-sm hover:border-brand hover:shadow transition"
                    >
                      <p className="text-2xl mb-1">📁</p>
                      <p className="text-sm font-medium text-slate-800">{name}</p>
                      <p className="text-xs text-slate-400">
                        {count} report{count === 1 ? "" : "s"}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              // ---- Inside a month folder ----
              <div>
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={() => setOpenMonth(null)}
                    className="text-sm text-slate-500 hover:underline"
                  >
                    ← All months ({selectedYear})
                  </button>
                  <h2 className="text-sm font-semibold text-slate-600">
                    📁 {MONTH_NAMES[openMonth]} {selectedYear}
                  </h2>
                  {isStaffOrAgency && (
                    <button
                      onClick={() => openAddForm(openMonth)}
                      className="text-xs px-3 py-1.5 rounded-md bg-brand text-white font-medium hover:bg-brand-light transition"
                    >
                      + Add Report
                    </button>
                  )}
                </div>

                {monthReports.length === 0 && (
                  <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
                    No reports for {MONTH_NAMES[openMonth]} {selectedYear} yet.
                  </div>
                )}

                <div className="space-y-3">
                  {monthReports.map((r) => {
                    const isDeleted = !!r.deleted_at;
                    return (
                      <div
                        key={r.id}
                        className={`bg-white border rounded-lg p-4 shadow-sm ${
                          isDeleted ? "border-red-200 opacity-70" : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-medium text-slate-800">
                            {r.title}
                            {isDeleted && (
                              <span className="ml-2 text-xs text-red-500 font-normal">(Deleted)</span>
                            )}
                          </p>
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

                        {!r.storage_path && r.file_expired_at && !isDeleted && (
                          <p className="text-xs text-slate-400 mt-2">
                            📎 File expired (14-month retention) — report details above are still kept.
                          </p>
                        )}

                        {!isDeleted && (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <DocumentsManager
                              entityColumn="monthly_report_id"
                              entityId={r.id}
                              folder={`reports/${selectedClientId || clientId}`}
                              canManage={isStaffOrAgency}
                            />
                          </div>
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
            )}
          </>
        )}

        {showForm && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 px-4">
            <form
              onSubmit={handleSubmitReport}
              className="bg-white border border-slate-200 rounded-lg p-5 shadow-lg space-y-3 w-full max-w-md"
            >
              <h3 className="text-sm font-semibold text-slate-700">New Monthly Report</h3>

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
                  Attach Documents (optional, up to 10)
                </label>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const selected = Array.from(e.target.files || []);
                    if (selected.length > 10) {
                      setError("You can attach at most 10 documents.");
                      e.target.value = "";
                      return;
                    }
                    const tooBig = selected.find((f) => f.size > 100 * 1024 * 1024);
                    if (tooBig) {
                      setError(`"${tooBig.name}" is too large. Max size is 100MB.`);
                      e.target.value = "";
                      return;
                    }
                    setError("");
                    setFiles(selected);
                  }}
                  className="text-sm"
                />
                {files.length > 0 && (
                  <p className="text-xs text-slate-400 mt-1">{files.length} file(s) selected.</p>
                )}
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
                  onClick={() => {
                    setShowForm(false);
                    setFiles([]);
                  }}
                  className="px-4 py-2 rounded-md border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {isStaffOrAgency && openMonth === null && selectedClientId && (
          <button
            onClick={() => openAddForm(null)}
            className="mt-4 px-4 py-2 rounded-md border border-brand text-brand text-sm font-medium hover:bg-slate-100 transition"
          >
            + Add Monthly Report
          </button>
        )}
      </div>
    </main>
  );
}
