"use client";

import { useState } from "react";
import Link from "next/link";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Request failed");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Plane className="h-10 w-10 text-primary-600" />
          </div>
          <CardTitle>Forgot password</CardTitle>
          <p className="text-sm text-slate-600 mt-1">
            Enter your email to receive a reset link
          </p>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="text-center space-y-4">
              <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg">
                If an account exists, a reset link has been sent to your email.
              </div>
              <Link href="/login" className="text-sm text-primary-600 hover:underline">
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
              )}
              <Input
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" className="w-full" loading={loading}>
                Send Reset Link
              </Button>
              <Link href="/login" className="block text-center text-sm text-primary-600 hover:underline">
                Back to login
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
