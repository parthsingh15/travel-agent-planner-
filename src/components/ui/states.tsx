import { AlertCircle, Loader2, Inbox } from "lucide-react";

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-red-600">
      <AlertCircle className="h-8 w-8 mb-3" />
      <p className="text-sm font-medium">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-sm text-primary-600 hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title = "No data yet",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
      <Inbox className="h-10 w-10 mb-3 text-slate-300" />
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="text-sm mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
