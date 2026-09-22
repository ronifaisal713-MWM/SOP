"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { AGENCY_ROLES, categoryForRole } from "@/lib/roleCategory";
import SocialLinksManager from "@/components/SocialLinksManager";

const MAX_IMAGE_SIZE_MB = 5;

const ROLE_LABEL = {
  super_admin: "Owner",
  admin: "Admin",
  project_manager: "Project Manager",
  team_lead: "Team Lead",
  employee: "Employee",
};

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
  const [role, setRole] = useState(null);
  const [isAgency, setIsAgency] = useState(false);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Personal info (everyone)
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Password change
  const [oldPassword, setOldPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
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
  const [assignedTeam, setAssignedTeam] = useState([]);
  const [companyName, setCompanyName] = useState("");
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  // Email change request
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailReason, setEmailReason] = useState("");
  const [submittingEmailRequest, setSubmittingEmailRequest] = useState(false);
  const [myEmailRequests, setMyEmailRequests] = useState([]);

  useEffect(() => {
    if (!checked || !user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, user]);

  async function load() {
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, avatar_url, role, organization_id, is_platform_owner")
      .eq("id", user.id)
      .single();

    setFullName(profile?.full_name || "");
    setPhone(profile?.phone || "");
    setAvatarUrl(profile?.avatar_url || "");

    const cat = categoryForRole(profile?.role);
    setCategory(cat);
    setRole(profile?.role || null);
    setIsAgency(AGENCY_ROLES.includes(profile?.role));
    setIsPlatformOwner(!!profile?.is_platform_owner);

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

        const { data: assignments } = await supabase
          .from("client_team_members")
          .select("user_id")
          .eq("client_id", clientUser.client_id);
        const staffIds = (assignments || []).map((a) => a.user_id);
        if (staffIds.length > 0) {
          const { data: staffProfiles } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .in("id", staffIds);
          setAssignedTeam(staffProfiles || []);
        }
      }
    }

    setLoading(false);
    loadEmailRequestsFor(user.id);
  }

  async function loadEmailRequestsFor(userId) {
    const { data } = await supabase
      .from("email_change_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    setMyEmailRequests(data || []);
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

  async function handlePlatformEmailChange() {
    if (!newEmail.trim()) return;
    setSubmittingEmailRequest(true);
    setError("");
    setSuccess("");

    const { error: emailError } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setSubmittingEmailRequest(false);

    if (emailError) {
      setError(emailError.message);
      return;
    }
    setNewEmail("");
    setShowEmailForm(false);
    setSuccess("Confirmation link sent to the new email address.");
  }

  async function handleRequestEmailChange(e) {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setSubmittingEmailRequest(true);
    setError("");
    setSuccess("");

    const { error: insertError } = await supabase.from("email_change_requests").insert({
      user_id: user.id,
      current_email: user.email,
      requested_email: newEmail.trim(),
      reason: emailReason.trim() || null,
    });

    setSubmittingEmailRequest(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewEmail("");
    setEmailReason("");
    setShowEmailForm(false);
    setSuccess("Email change request submitted for review.");
    loadEmailRequestsFor(user.id);
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
    setPasswordError("");
    setConfirmPasswordError("");

    if (!oldPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setConfirmPasswordError("New password and confirm password does not match.");
      return;
    }

    setSavingPassword(true);

    // Verify the current password by re-authenticating with it --
    // Supabase has no separate "check my current password" call.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    });
    if (verifyError) {
      setSavingPassword(false);
      setPasswordError("Current Password does not match.");
      return;
    }

    const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (pwError) {
      setError(pwError.message);
      return;
    }
    setOldPassword("");
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

  async function handleRequestDeletion(scope) {
    const confirmMsg =
      scope === "agency"
        ? "This deletes your ENTIRE agency -- all staff, all clients, all data -- in 3 days unless cancelled. Continue?"
        : "This deletes your account and data in 3 days unless cancelled. Continue?";
    if (!confirm(confirmMsg)) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const res = await fetch("/api/account/request-deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope }),
    });

    if (res.ok) {
      window.location.href = "/dashboard";
    } else {
      const result = await res.json();
      setError(result.error || "Something went wrong");
    }
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

            {isPlatformOwner ? (
              <div className="mt-2">
                <p className="text-xs text-slate-400 mb-2">
                  As the Platform Owner, you can change your email directly. Supabase will send a
                  confirmation link to the new address.
                </p>
                {!showEmailForm ? (
                  <button
                    type="button"
                    onClick={() => setShowEmailForm(true)}
                    className="text-brand text-xs hover:underline"
                  >
                    Change email
                  </button>
                ) : (
                  <div className="border border-slate-200 rounded-md p-3 space-y-2">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="new@example.com"
                      className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handlePlatformEmailChange}
                      disabled={submittingEmailRequest || !newEmail.trim()}
                      className="px-3 py-1.5 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand-light transition disabled:opacity-60"
                    >
                      {submittingEmailRequest ? "Updating..." : "Send Confirmation Link"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-400 mt-1">
                  Changing your email needs approval
                  {isAgency ? " from the Platform Owner" : " from your agency's Owner/Admin"}.{" "}
                  <button
                    type="button"
                    onClick={() => setShowEmailForm((s) => !s)}
                    className="text-brand hover:underline"
                  >
                    Request a change
                  </button>
                </p>

                {myEmailRequests.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {myEmailRequests.map((r) => (
                      <p key={r.id} className="text-xs text-slate-400">
                        → {r.requested_email}:{" "}
                        <span
                          className={
                            r.status === "approved"
                              ? "text-green-600"
                              : r.status === "rejected"
                              ? "text-red-500"
                              : "text-amber-500"
                          }
                        >
                          {r.status}
                        </span>
                      </p>
                    ))}
                  </div>
                )}

                {showEmailForm && (
                  <div className="mt-3 border border-slate-200 rounded-md p-3 space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">New Email</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                        placeholder="new@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Reason (optional)
                      </label>
                      <input
                        value={emailReason}
                        onChange={(e) => setEmailReason(e.target.value)}
                        className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRequestEmailChange}
                      disabled={submittingEmailRequest || !newEmail.trim()}
                      className="px-3 py-1.5 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand-light transition disabled:opacity-60"
                    >
                      {submittingEmailRequest ? "Submitting..." : "Submit Request"}
                    </button>
                  </div>
                )}
              </>
            )}
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
            <label className="block text-sm font-medium text-slate-600 mb-1">Current Password</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => {
                setOldPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              className={`w-full border rounded-md px-3 py-2 text-sm ${
                passwordError ? "border-red-400" : "border-slate-300"
              }`}
            />
            {passwordError && <p className="text-xs text-red-600 mt-1">{passwordError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (confirmPasswordError) setConfirmPasswordError("");
              }}
              placeholder="At least 8 characters"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (confirmPasswordError) setConfirmPasswordError("");
              }}
              className={`w-full border rounded-md px-3 py-2 text-sm ${
                confirmPasswordError ? "border-red-400" : "border-slate-300"
              }`}
            />
            {confirmPasswordError && (
              <p className="text-xs text-red-600 mt-1">{confirmPasswordError}</p>
            )}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        {category === "client" && clientId && <SocialLinksManager clientId={clientId} />}

        {category === "client" && clientId && (
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Your Team</h2>
            {assignedTeam.length === 0 ? (
              <p className="text-xs text-slate-400">
                No team members have been assigned to your account yet.
              </p>
            ) : (
              <div className="space-y-2">
                {assignedTeam.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {initials(m.full_name)}
                    </div>
                    <div>
                      <p className="text-sm text-slate-700">{m.full_name || "Unnamed"}</p>
                      <p className="text-xs text-slate-400">{ROLE_LABEL[m.role] || m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-3">
              You can @mention any of these teammates in chat.
            </p>
          </div>
        )}

        {/* ---------- Danger Zone (everyone, not shown to Platform Owner) ---------- */}
        {!isPlatformOwner && (
          <div className="bg-white border border-red-200 rounded-lg p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-red-600">Danger Zone</h2>

            {role === "super_admin" ? (
              <>
                <p className="text-xs text-slate-500">
                  Deleting your agency removes every staff member, every client, and all their
                  data. This cannot be undone after 3 days.
                </p>
                <button
                  onClick={() => handleRequestDeletion("agency")}
                  className="text-sm border border-red-300 text-red-600 rounded-md px-4 py-2 font-medium hover:bg-red-50 transition"
                >
                  Delete My Agency
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  Deleting your account removes your access and data. This cannot be undone after
                  3 days.
                </p>
                <button
                  onClick={() => handleRequestDeletion("self")}
                  className="text-sm border border-red-300 text-red-600 rounded-md px-4 py-2 font-medium hover:bg-red-50 transition"
                >
                  Delete My Account
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
