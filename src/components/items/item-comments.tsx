"use client";

import { useEffect, useState, useTransition } from "react";
import { Lock, MessageSquare, Trash2 } from "lucide-react";
import { Modal, modalButton, modalField } from "@/components/ui/modal";
import type { CommentEntity, ItemCommentRow } from "@/lib/item-comments";
import { addCommentAction, deleteCommentAction, listCommentsAction, type ViewerComment } from "@/lib/item-comment-actions";

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Read-only list of comments (used in the sale add-to-cart popup). */
export function CommentList({ rows, onDelete, canDelete }: { rows: ItemCommentRow[]; onDelete?: (id: string) => void; canDelete?: (row: ItemCommentRow) => boolean }) {
  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li key={row.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-700">{row.author}</span>
            <span className="flex items-center gap-2">
              <span title={new Date(row.at).toLocaleString()}>{timeAgo(row.at)}</span>
              {onDelete && canDelete?.(row) ? (
                <button type="button" onClick={() => onDelete(row.id)} aria-label="Delete comment" className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-slate-800">{row.text}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Seller-side comment thread for one item. Comments are internal: they never appear on
 * receipts, invoices or quotations.
 */
export function ItemComments({ entityType, entityId, compact }: { entityType: CommentEntity; entityId: string; compact?: boolean }) {
  const [rows, setRows] = useState<ViewerComment[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let cancelled = false;
    listCommentsAction(entityType, entityId).then((list) => {
      if (!cancelled) setRows(list);
    });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  function post() {
    startTransition(async () => {
      const result = await addCommentAction(entityType, entityId, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows(result.rows);
      setText("");
      setError(null);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteCommentAction(id);
      if (result.ok) setRows(result.rows);
      else setError(result.error);
    });
  }

  return (
    <section className={`grid gap-3 ${compact ? "" : "mt-5 border-t border-slate-100 pt-4"}`}>
      {!compact ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <MessageSquare className="size-3.5" /> Internal comments
          {rows?.length ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium normal-case text-slate-700">{rows.length}</span> : null}
        </p>
      ) : null}
      <p className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
        <Lock className="size-3.5 shrink-0" /> Only your team sees these — they never appear on receipts, invoices or quotations.
      </p>
      <div className="grid gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && text.trim()) post();
          }}
          rows={2}
          maxLength={1000}
          placeholder="e.g. Customer asked about this one · minor scratch near camera · price is negotiable to 95k"
          className={modalField.input}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">Ctrl + Enter to post</span>
          <button type="button" onClick={post} disabled={pending || !text.trim()} className={modalButton.primary}>
            {pending ? "Posting..." : "Post comment"}
          </button>
        </div>
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>
      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length ? (
        <CommentList rows={rows} onDelete={remove} canDelete={(row) => (row as ViewerComment).canDelete} />
      ) : (
        <p className="text-sm text-slate-500">No comments yet.</p>
      )}
    </section>
  );
}

/** Button + popup with the comment thread — for rows that have no edit popup (accessories). */
export function ItemCommentsButton({ entityType, entityId, title, count }: { entityType: CommentEntity; entityId: string; title: string; count?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-50"
        title="Internal comments"
      >
        <MessageSquare className="size-3" />
        {count ? count : "Comments"}
      </button>
      {open ? (
        <Modal title="Internal comments" subtitle={title} icon={<MessageSquare className="size-4" />} onClose={() => setOpen(false)} footer={<button type="button" onClick={() => setOpen(false)} className={modalButton.secondary}>Close</button>}>
          <ItemComments entityType={entityType} entityId={entityId} compact />
        </Modal>
      ) : null}
    </>
  );
}
