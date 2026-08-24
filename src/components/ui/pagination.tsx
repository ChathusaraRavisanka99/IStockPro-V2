"use client";

import Link from "next/link";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  query: Record<string, string>;
};

function href(query: Record<string, string>, page: number, pageSize: number) {
  const params = new URLSearchParams({ ...query, page: String(page), pageSize: String(pageSize) });
  return `?${params.toString()}`;
}

export function Pagination({ page, pageSize, total, query }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const firstItem = total ? (page - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/70 p-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
      <span>Showing {firstItem}-{lastItem} of {total}</span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">Rows<select defaultValue={String(pageSize)} onChange={(event) => { window.location.href = href(query, 1, Number(event.target.value)); }} className="rounded-lg border border-slate-300 bg-white px-2 py-1"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
        <Link aria-disabled={page <= 1} className={`rounded-lg border px-3 py-1 ${page <= 1 ? "pointer-events-none opacity-40" : "border-slate-300"}`} href={href(query, Math.max(1, page - 1), pageSize)}>Previous</Link>
        <span className="px-1">Page {page} of {totalPages}</span>
        <Link aria-disabled={page >= totalPages} className={`rounded-lg border px-3 py-1 ${page >= totalPages ? "pointer-events-none opacity-40" : "border-slate-300"}`} href={href(query, Math.min(totalPages, page + 1), pageSize)}>Next</Link>
      </div>
    </div>
  );
}
