"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};

/**
 * Paginated, searchable table over `/api/admin/resources/[resource]`.
 * One component serves every admin entity, so adding a managed resource is a
 * column definition rather than another page.
 */
export function AdminResourceTable<T extends { id: string }>({
  resource,
  columns,
  searchPlaceholder = "Search...",
  filters,
  emptyTitle = "Nothing here yet",
  refreshKey,
}: {
  resource: string;
  columns: Column<T>[];
  searchPlaceholder?: string;
  filters?: { field: string; label: string; options: string[] }[];
  emptyTitle?: string;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<T[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        ...(search ? { search } : {}),
        ...activeFilters,
      });

      const res = await fetch(`/api/admin/resources/${resource}?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load data");

      setRows(data.items);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load data");
    } finally {
      setLoading(false);
    }
  }, [resource, page, search, activeFilters]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={submitSearch} className="flex gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search className="h-4 w-4" />
          </Button>
        </form>

        {filters?.map((filter) => (
          <div key={filter.field}>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {filter.label}
            </label>
            <select
              value={activeFilters[filter.field] ?? ""}
              onChange={(e) => {
                setPage(1);
                setActiveFilters((prev) => {
                  const next = { ...prev };
                  if (e.target.value) next[filter.field] = e.target.value;
                  else delete next[filter.field];
                  return next;
                });
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All</option>
              {filter.options.map((option) => (
                <option key={option} value={option}>
                  {option.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {loading && <LoadingState message="Loading..." />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && rows.length === 0 && <EmptyState title={emptyTitle} />}

      {!loading && !error && rows.length > 0 && (
        <>
          <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-slate-500 whitespace-nowrap"
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-4 py-2.5 text-slate-700 ${column.className ?? ""}`}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <p>
                Page {pagination.page} of {pagination.totalPages} ·{" "}
                {pagination.total} total
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!pagination.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
