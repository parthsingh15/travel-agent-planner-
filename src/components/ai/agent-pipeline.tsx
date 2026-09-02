"use client";

import {
  AGENTS,
  getAgentStatus,
  type GenerationFields,
} from "@/lib/agents/constants";
import { cn } from "@/lib/utils";
import { CheckCircle, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";

type Generation = GenerationFields;

export function AgentPipeline({ generation }: { generation: Generation }) {
  return (
    <div className="space-y-3">
      {AGENTS.map((agent, index) => {
        const status = getAgentStatus(agent.id, generation);

        return (
          <div key={agent.id} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-lg border-2",
                  status === "completed" && "bg-green-100 border-green-500",
                  status === "running" && "bg-primary-100 border-primary-500 animate-pulse",
                  status === "failed" && "bg-red-100 border-red-500",
                  status === "skipped" && "bg-amber-50 border-amber-400",
                  status === "pending" && "bg-slate-100 border-slate-300"
                )}
              >
                {agent.icon}
              </div>
              {index < AGENTS.length - 1 && (
                <div
                  className={cn(
                    "w-0.5 h-8 my-1",
                    status === "completed" ? "bg-green-400" : "bg-slate-200"
                  )}
                />
              )}
            </div>

            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-slate-900">{agent.name}</h4>
                {status === "running" && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                )}
                {status === "completed" && (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                )}
                {status === "failed" && (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                {status === "skipped" && (
                  <MinusCircle className="h-4 w-4 text-amber-600" />
                )}
                {status === "pending" && (
                  <Circle className="h-4 w-4 text-slate-300" />
                )}
              </div>
              <p className="text-sm text-slate-600">{agent.description}</p>
              {status === "running" && (
                <p className="text-xs text-primary-600 mt-1 font-medium">
                  Agent is working...
                </p>
              )}
              {status === "skipped" && (
                <p className="text-xs text-amber-700 mt-1 font-medium">
                  Unavailable — the plan was completed without this agent.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
