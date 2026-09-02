"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Bot, User } from "lucide-react";

type Message = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

function ChatContent() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("tripId");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const url = tripId ? `/api/chat?tripId=${tripId}` : "/api/chat";
        const res = await fetch(url);
        const data = await res.json();
        if (res.ok && data.sessions?.length > 0) {
          const latest = data.sessions[0];
          setSessionId(latest.id);
          if (latest.messages?.length > 0) {
            setMessages(latest.messages);
          }
        }
      } catch {
        // ignore — fresh chat is fine
      }
    };
    loadHistory();
  }, [tripId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString(),
      },
    ]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          ...(sessionId && { sessionId }),
          ...(tripId && { tripId }),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const details = data.details
          ? Object.values(data.details).flat().join(", ")
          : "";
        throw new Error(details ? `${data.error}: ${details}` : data.error);
      }

      setSessionId(data.sessionId);
      setMessages((prev) => [
        ...prev.filter((m) => !m.id.startsWith("temp-")),
        {
          id: `user-${Date.now()}`,
          role: "user",
          content: userMessage,
          createdAt: new Date().toISOString(),
        },
        data.message,
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: err instanceof Error ? err.message : "Failed to get response",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <Card className="h-[calc(100vh-12rem)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary-600" />
              Travel AI Assistant
              {tripId && (
                <span className="text-sm font-normal text-slate-500">
                  (Trip context enabled)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col h-[calc(100%-5rem)]">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {messages.length === 0 && (
                <div className="text-center text-slate-500 py-12">
                  <Bot className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                  <p>Ask me anything about your trip!</p>
                  <p className="text-sm mt-1">
                    Try: &quot;What are the best restaurants near my hotel?&quot;
                  </p>
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-lg text-sm ${
                      msg.role === "user"
                        ? "bg-primary-600 text-white"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {msg.content}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary-600 animate-pulse" />
                  </div>
                  <div className="px-4 py-2 rounded-lg bg-slate-100 text-sm text-slate-500">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={sendMessage} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your trip..."
                className="flex-1 px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={loading}
              />
              <Button type="submit" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <ChatContent />
    </Suspense>
  );
}
