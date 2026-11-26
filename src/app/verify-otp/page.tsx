"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function VerifyOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [code, setCode] = useState("");
  const [error, setError] = useState(searchParams.get("delivery") === "failed"
    ? "Your account was created, but we could not send the verification email. Use Resend code to try again." : "");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("Verification code sent. Check your email.");
      } else {
        setError(data.error);
      }
    } catch {
      setError("Failed to resend OTP");
    } finally {
      setResending(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <Plane className="h-10 w-10 text-primary-600" />
        </div>
        <CardTitle>Verify your email</CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          Enter the 6-digit verification code for {email}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
          )}
          {message && (
            <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg">{message}</div>
          )}
          <Input
            label="Verification Code"
            required
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="text-center text-2xl tracking-widest"
          />
          <Button type="submit" className="w-full" loading={loading}>
            Verify Email
          </Button>
        </form>
        <button
          onClick={handleResend}
          disabled={resending}
          className="w-full mt-4 text-sm text-primary-600 hover:underline disabled:opacity-50"
        >
          {resending ? "Resending..." : "Resend code"}
        </button>
      </CardContent>
    </Card>
  );
}

export default function VerifyOtpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <Suspense fallback={<div>Loading...</div>}>
        <VerifyOtpForm />
      </Suspense>
    </div>
  );
}
