"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session";
import { Dashboard } from "@/components/Dashboard";
import { Spinner } from "@/components/ui";

export default function DashboardPage() {
  const { user, loading } = useSession();
  const router = useRouter();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Spinner className="h-6 w-6 text-indigo-500" />
      </div>
    );
  }

  if (!user) {
    // Not logged in — bounce to login. (Also handled on mount via useSession.)
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  return <Dashboard user={user} />;
}
