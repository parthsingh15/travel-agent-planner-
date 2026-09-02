"use client";

import { AGENTS } from "@/lib/agents/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Generation = Record<string, unknown>;

function renderValue(value: unknown, depth = 0): React.ReactNode {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className={`space-y-1 ${depth > 0 ? "ml-4" : ""}`}>
        {value.map((item, i) => (
          <li key={i} className="text-sm text-slate-700">
            {typeof item === "object" ? (
              <div className="bg-slate-50 rounded p-2 mt-1">{renderValue(item, depth + 1)}</div>
            ) : (
              String(item)
            )}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <div className={`space-y-2 ${depth > 0 ? "ml-2" : ""}`}>
        {Object.entries(value as Record<string, unknown>).map(([key, val]) => (
          <div key={key}>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {key.replace(/([A-Z])/g, " $1").trim()}
            </span>
            <div className="mt-0.5">{renderValue(val, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function AgentOutputs({ generation }: { generation: Generation }) {
  const agentsWithOutput = AGENTS.filter((agent) => generation[agent.field]);

  if (agentsWithOutput.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-8">
        Agent outputs will appear here as each agent completes its work.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {agentsWithOutput.map((agent) => (
        <Card key={agent.id}>
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span>{agent.icon}</span>
              {agent.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {renderValue(generation[agent.field])}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
