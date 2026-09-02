"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Map,
  MessageSquare,
  CreditCard,
  Settings,
  Shield,
  LogOut,
  Plane,
  Bell,
  Ticket,
  Search,
  Bookmark,
} from "lucide-react";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trips", label: "My Trips", icon: Map },
  { href: "/search", label: "Search", icon: Search },
  { href: "/bookmarks", label: "Saved", icon: Bookmark },
  { href: "/bookings", label: "Bookings", icon: Ticket },
  { href: "/price-alerts", label: "Price Alerts", icon: Bell },
  { href: "/chat", label: "AI Assistant", icon: MessageSquare },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/profile", label: "Profile", icon: Settings },
];

export function Navbar({ user }: { user: User }) {
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold text-primary-600">
              <Plane className="h-6 w-6" />
              <span>Travel Planner</span>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      pathname.startsWith(item.href)
                        ? "bg-primary-50 text-primary-700"
                        : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              {user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    pathname.startsWith("/admin")
                      ? "bg-primary-50 text-primary-700"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 hidden sm:block">{user.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-red-600 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
