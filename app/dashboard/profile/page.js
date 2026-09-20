"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { AGENCY_ROLES, categoryForRole } from "@/lib/roleCategory";

const MAX_IMAGE_SIZE_MB = 5;

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

async function uploadImage(file, folder) {
  const path = `${folder}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from("profile-images").upload(path, file);
  if (error) throw error;
  return supabase.storage.from("profile-images").getPublicUrl(path).data.publicUrl;
}

export default function ProfilePage() {
  const { user, checked } = useRequireAuth();
  const [category, setCategory] = useState(null);
  const [isAgency, setIsAgency] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Personal info (everyone)
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Agency/organization info
  const [orgId, setOrgId] = useState(null);
  const [orgName, setOrgName] = useState("");
  const [orgLogoUrl, setOrgLogoUrl] = useState("");
  const [orgWebsite, setOrgWebsite] = useState("");
  const [orgAddress, setOrgAddress] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);

  // Client/company info
  const [clientId, setClientId] = useState(null);
  const [companyName, setCompanyName] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  useEffect(() => {
    if (!checked || !user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user]);

  async function load() {
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, avatar_url, role, organization_id")
      .eq("id", user.id)
      .single();

    setFullName(profile?.full_name || "");
    setPhone(profile?.phone || "");
    setAvatarUrl(profile?.avatar_url || "");

    const cat = categoryForRole(profile?.role);
    setCategory(cat);
    setIsAgency(AGENCY_ROLES.includes(profile?.role));

    if (cat === "agency" || cat === "staff") {
      if (profile?.organization_id) {
        setOrgId(profile.organization_id);
        const { data: org } = await supabase
          .from("organizations")
          .select("name, logo_url, website, address, phone")
          .eq("id", profile.organization_id)
          .single();
        setOrgName(org?.name || "");
        setOrgLogoUrl(org?.logo_url || "");
        setOrgWebsite(org?.website || "");
        setOrgAddress(org?.address || "");
        setOrgPhone(org?.phone || "");
      }
    }

    if (cat === "client") {
      const { data: clientUser } = await supabase
        .from("client_users")
        .select("client_id")
        .eq("id", user.id)
        .maybeSingle();
      if (clientUser?.client_id) {
        setClientId(clientUser.client_id);
        const { data: client } = await supabase
          .from("clients")
          .select("company_name, logo_url, website, address, phone, industry, business_type, target_market")
          .eq("id", clientUser.client_id)
          .single();
        setCompanyName(client?.company_name || "");
        setCompanyLogoUrl(client?.logo_url || "");
        setCompanyWebsite(client?.website || "");
        setCompanyAddress(client?.address || "");
        setCompanyPhone(client?.phone || "");
        setIndustry(client?.industry || "");
        setBusinessType(client?.business_type || "");
        setTargetMarket(client?.target_market || "");
      }
    }

    setLoading(false);
  }

  function validateImage(file) {
    if (file && file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      setError(`Image is too large. Max size is ${MAX_IMAGE_SIZE_MB}MB.`);
      return false;
    }
    return true;
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file || !validateImage(file)) return;
    setError("");
    try {
      const url = await uploadImage(file, `avatars/${user.id}`);
      setAvatarUrl(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSavePersonal(e) {
    e.preventDefault();
    setSavingPersonal(true);
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null, phone: phone.trim() || null, avatar_url: avatarUrl || null })
      .eq("id", user.id);

    setSavingPersonal(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess("Profile updated.");
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSavingPassword(true);
    const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (pwError) {
      setError(pwError.message);
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setSuccess("Password updated.");
  }

  async function handleOrgLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file || !validateImage(file)) return;
    setError("");
    try {
      const url = await uploadImage(file, `org-logos/${orgId}`);
      setOrgLogoUrl(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveOrg(e) {
    e.preventDefault();
    setSavingOrg(true);
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("organizations")
      .update({
        name: orgName.trim(),
        logo_url: orgLogoUrl || null,
        website: orgWebsite.trim() || null,
        address: orgAddress.trim() || null,
        phone: orgPhone.trim() || null,
      })
      .eq("id", orgId);

    setSavingOrg(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess("Agency details updated.");
  }

  async function handleCompanyLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file || !validateImage(file)) return;
    setError("");
    try {
      const url = await uploadImage(file, `client-logos/${clientId}`);
      setCompanyLogoUrl(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveClient(e) {
    e.preventDefault();
    setSavingClient(true);
    setError("");
    setSuccess("");

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        company_name: companyName.trim(),
        logo_url: companyLogoUrl || null,
        website: companyWebsite.trim() || null,
        address: companyAddress.trim() || null,
        phone: companyPhone.trim() || null,
        industry: industry.trim() || null,
        business_type: businessType.trim() || null,
        target_market: targetMarket.trim() || null,
      })
      .eq("id", clientId);

    setSavingClient(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess("Company details updated.");
  }

  if (!checked || loading) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  return (
    <main className="px-6 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-brand">Profile</h1>
          <a href="/dashboard" className="text-sm text-slate-500 hover:underline">
            ← Back to dashboard
          </a>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">{success}</p>}

        {/* ---------- Personal info (everyone) ---------- */}
        <form onSubmit={handleSavePersonal} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Your Info</h2>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-brand text-white flex items-center justify-center text-lg font-semibold overflow-hidden flex-shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                initials(fullName)
              )}
            </div>
            <label className="text-sm text-brand hover:underline cursor-pointer">
              Change Photo
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
            <input
              value={user?.email || ""}
              disabled
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-slate-50 text-slate-400"
            />
          </div>

          <button
            type="submit"
            disabled={savingPersonal}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-60"
          >
            {savingPersonal ? "Saving..." : "Save"}
          </button>
        </form>

        {/* ---------- Password ---------- */}
        <form onSubmit={handleChangePassword} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Change Password</h2>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={savingPassword}
            className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-60"
          >
            {savingPassword ? "Updating..." : "Update Password"}
          </button>
        </form>

        {/* ---------- Agency details (Agency role only) ---------- */}
        {isAgency && orgId && (
          <form onSubmit={handleSaveOrg} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">Agency Details</h2>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {orgLogoUrl ? (
                  <img src={orgLogoUrl} alt="Agency logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-300 text-xs">No logo</span>
                )}
              </div>
              <label className="text-sm text-brand hover:underline cursor-pointer">
                Change Logo
                <input type="file" accept="image/*" className="hidden" onChange={handleOrgLogoChange} />
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Agency Name</label>
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Website</label>
              <input
                value={orgWebsite}
                onChange={(e) => setOrgWebsite(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Phone</label>
              <input
                value={orgPhone}
                onChange={(e) => setOrgPhone(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Address</label>
              <textarea
                rows={2}
                value={orgAddress}
                onChange={(e) => setOrgAddress(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={savingOrg}
              className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-60"
            >
              {savingOrg ? "Saving..." : "Save Agency Details"}
            </button>
          </form>
        )}

        {/* ---------- Company details (Client role only) ---------- */}
        {category === "client" && clientId && (
          <form onSubmit={handleSaveClient} className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">Company Details</h2>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {companyLogoUrl ? (
                  <img src={companyLogoUrl} alt="Company logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-300 text-xs">No logo</span>
                )}
              </div>
              <label className="text-sm text-brand hover:underline cursor-pointer">
                Change Logo
                <input type="file" accept="image/*" className="hidden" onChange={handleCompanyLogoChange} />
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Company Name</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Industry</label>
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Business Type</label>
                <input
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Target Market</label>
              <input
                value={targetMarket}
                onChange={(e) => setTargetMarket(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Website</label>
              <input
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Phone</label>
              <input
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Address</label>
              <textarea
                rows={2}
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={savingClient}
              className="px-4 py-2 rounded-md bg-brand text-white text-sm font-medium hover:bg-brand-light transition disabled:opacity-60"
            >
              {savingClient ? "Saving..." : "Save Company Details"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
