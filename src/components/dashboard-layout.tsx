"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { LoadingState } from "@/components/ui/states";

type User = {
  id: string;
  email: string;
  name: string;
  role: string;
  emailVerified: boolean;
};

export function DashboardLayout({
  children,
  requireVerified = true,
}: {
  children: React.ReactNode;
  requireVerified?: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push("/login");
          return;
        }
        if (requireVerified && !data.user.emailVerified) {
          router.push(`/verify-otp?email=${encodeURIComponent(data.user.email)}`);
          return;
        }
        setUser(data.user);
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router, requireVerified]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <LoadingState message="Loading..." />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
