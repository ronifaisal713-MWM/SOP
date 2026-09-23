"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { categoryForRole } from "@/lib/roleCategory";
import DocumentsManager from "@/components/DocumentsManager";

function generateInvoiceNumber() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${y}${m}${day}-${rand}`;
}

function displayStatus(invoice) {
  if (invoice.status === "paid") return "paid";
  if (invoice.due_date && new Date(invoice.due_date) < new Date()) return "overdue";
  return "unpaid";
}

const STATUS_STYLE = {
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  unpaid: "bg-amber-100 text-amber-700",
};

export default function BillingPage() {
  const { user, checked } = useRequireAuth();
  const [category, setCategory] = useState(null);

  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientId, setClientId] = useState(null); // resolved for client role

  const [invoices, setInvoices] = useState([]);
  const [profileMap, setProfileMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!checked || !user) return;
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user]);

  async function init() {
    setLoading(true);

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const cat = categoryForRole(profile?.role);
    setCategory(cat);

    if (cat === "client") {
      const { data: clientUser } = await supabase
        .from("client_users")
        .select("client_id")
        .eq("id", user.id)
        .maybeSingle();
      const cid = clientUser?.client_id || null;
      setClientId(cid);
      if (cid) await loadInvoices(cid, cat);
      setLoading(false);
      return;
    }

    const { data: clientRows } = await supabase.from("clients").select("id, company_name");
    setClients(clientRows || []);
    if (clientRows && clientRows.length > 0) {
      setSelectedClientId(clientRows[0].id);
      await loadInvoices(clientRows[0].id, cat);
    }
    setLoading(false);
  }

  async function loadInvoices(forClientId, cat) {
    const { data, error: fetchError } = await supabase
      .from("invoices")
      .select("*")
      .eq("client_id", forClientId)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const rows = data || [];
    setInvoices(rows);

    if (cat !== "client") {
      const ids = [
        ...new Set([...rows.map((r) => r.created_by), ...rows.map((r) => r.paid_by)].filter(Boolean)),
      ];
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
    await loadInvoices(newClientId, category);
    setLoading(false);
  }

  function openForm() {
    setInvoiceNumber(generateInvoiceNumber());
    setAmount("");
    setPeriod("");
    setDueDate("");
    setDescription("");
    setError("");
    setShowForm(true);
  }

  async function handleCreateInvoice(e) {
    e.preventDefault();
    if (!invoiceNumber.trim() || !amount) return;

    setSubmitting(true);
    setError("");

    const { error: insertError } = await supabase.from("invoices").insert({
      client_id: selectedClientId,
      invoice_number: invoiceNumber.trim(),
      amount: parseFloat(amount),
      period: period.trim() || null,
      due_date: dueDate || null,
      description: description.trim() || null,
      created_by: user.id,
      status: "unpaid",
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setShowForm(false);
    await loadInvoices(selectedClientId, category);
  }

  async function handleMarkPaid(invoiceId) {
    await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString(), paid_by: user.id })
      .eq("id", invoiceId);
    await loadInvoices(selectedClientId, category);
  }

  async function handleDelete(invoiceId) {
    if (!confirm("Delete this invoice? The client will no longer see it.")) return;
    await supabase
      .from("invoices")
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq("id", invoiceId);
    await loadInvoices(category === "client" ? clientId : selectedClientId, category);
  }

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  const isStaffOrAgency = category === "agency" || category === "staff";
  const activeClientId = category === "client" ? clientId : selectedClientId;

  return (
    <main className="px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand">Billing</h1>
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
          <p className="text-sm text-slate-400">No clients to bill yet.</p>
        )}

        {isStaffOrAgency && selectedClientId && !showForm && (
          <button
            onClick={openForm}
            className="mb-4 px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition"
          >
            + Create Invoice
          </button>
        )}

        {showForm && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 px-4 py-8">
            <form
              onSubmit={handleCreateInvoice}
              className="bg-white border border-slate-200 rounded-lg p-5 shadow-lg space-y-3 w-full max-w-md max-h-[85vh] overflow-y-auto"
            >
              <h3 className="text-sm font-semibold text-slate-700">New Invoice</h3>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Invoice Number</label>
                <input
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Period</label>
                  <input
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    placeholder="e.g. September 2026"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this bill covers..."
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <p className="text-xs text-slate-400">
                You can attach a PDF/document to this invoice once it's created.
              </p>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-60"
                >
                  {submitting ? "Sending..." : "Send Invoice"}
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
          </div>
        )}

        {error && !showForm && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <div className="space-y-3">
          {invoices.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400 text-sm">
              No invoices yet.
            </div>
          )}

          {invoices.map((inv) => {
            const isDeleted = !!inv.deleted_at;
            const st = displayStatus(inv);
            return (
              <div
                key={inv.id}
                className={`bg-white border rounded-lg p-4 shadow-sm ${
                  isDeleted ? "border-red-200 opacity-70" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-slate-800">
                      {inv.invoice_number}
                      {isDeleted && <span className="ml-2 text-xs text-red-500 font-normal">(Deleted)</span>}
                    </p>
                    {inv.period && <p className="text-xs text-slate-400">{inv.period}</p>}
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[st]}`}>
                    {st}
                  </span>
                </div>

                <p className="text-lg font-semibold text-slate-700 mt-2">
                  BDT {Number(inv.amount).toLocaleString()}
                </p>

                {inv.due_date && (
                  <p className="text-xs text-slate-400 mt-1">Due {inv.due_date}</p>
                )}

                {inv.description && (
                  <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{inv.description}</p>
                )}

                {!isDeleted && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <DocumentsManager
                      entityColumn="invoice_id"
                      entityId={inv.id}
                      folder={`invoices/${activeClientId}`}
                      canManage={isStaffOrAgency}
                    />
                  </div>
                )}

                {isStaffOrAgency && !isDeleted && (
                  <div className="flex gap-3 mt-3">
                    {st !== "paid" && (
                      <button
                        onClick={() => handleMarkPaid(inv.id)}
                        className="text-xs text-green-600 hover:underline"
                      >
                        Mark as Paid
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(inv.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                )}

                {isStaffOrAgency && (
                  <p className="text-xs text-slate-400 mt-2">
                    Sent by {profileMap[inv.created_by] || "Unknown"}
                    {inv.status === "paid" && inv.paid_by && (
                      <> · Marked paid by {profileMap[inv.paid_by] || "Unknown"}</>
                    )}
                    {isDeleted && inv.deleted_by && (
                      <> · Deleted by {profileMap[inv.deleted_by] || "Unknown"}</>
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
