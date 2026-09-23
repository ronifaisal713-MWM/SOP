"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { ALL_STAFF_ROLES } from "@/lib/roleCategory";
import TaskChat from "@/components/TaskChat";
import TaskDetailsPanel from "@/components/TaskDetailsPanel";

export default function TaskDetailPage() {
  const { user, checked } = useRequireAuth();
  const params = useParams();
  const { id } = params;

  const [isStaff, setIsStaff] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    if (!checked || !user) return;

    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setIsStaff(!!data?.role && ALL_STAFF_ROLES.includes(data.role));
        setRoleChecked(true);
      });
  }, [checked, user]);

  if (!checked || !roleChecked) {
    return <main className="flex items-center justify-center py-20 text-slate-400">Loading...</main>;
  }

  return (
    <main className="px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <a href="/dashboard/tasks" className="text-sm text-slate-500 hover:underline">
          ← Task Board
        </a>

        <div className="mt-4">
          <TaskDetailsPanel taskId={id} currentUser={user} isStaff={isStaff} />
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm mt-4 h-[420px]">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-600">Chat</h2>
          </div>
          <div className="h-[calc(100%-45px)]">
            <TaskChat taskId={id} currentUser={user} isStaff={isStaff} />
          </div>
        </div>
      </div>
    </main>
  );
}
