import { prisma } from "@/lib/prisma";

/**
 * Internal, seller-side comments on stock items (phone units and accessories). Stored as
 * AuditLog rows (action "ItemComment") so they carry author + time with no schema change, and
 * they are never rendered on receipts, invoices or quotations — only inside the app.
 */
export const ITEM_COMMENT_ACTION = "ItemComment";
export type CommentEntity = "Phone" | "Accessory";
export type ItemCommentRow = { id: string; text: string; author: string; authorId: string | null; at: string };

const MAX_LENGTH = 1000;

function toRow(log: { id: string; details: unknown; createdAt: Date; userId: string | null; user: { name: string | null; username: string } | null }): ItemCommentRow {
  return {
    id: log.id,
    text: String((log.details as { text?: unknown } | null)?.text ?? ""),
    author: log.user ? log.user.name || log.user.username : "Unknown",
    authorId: log.userId,
    at: log.createdAt.toISOString(),
  };
}

export async function listItemComments(entityType: CommentEntity, entityId: string): Promise<ItemCommentRow[]> {
  const logs = await prisma.auditLog.findMany({
    where: { action: ITEM_COMMENT_ACTION, entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, username: true } } },
    take: 200,
  });
  return logs.map(toRow);
}

export async function addItemComment(entityType: CommentEntity, entityId: string, text: string, userId: string | undefined): Promise<{ ok: true; rows: ItemCommentRow[] } | { ok: false; error: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Write a comment first." };
  if (trimmed.length > MAX_LENGTH) return { ok: false, error: `Keep comments under ${MAX_LENGTH} characters.` };
  if (!userId) return { ok: false, error: "Sign in again to comment." };
  const exists = entityType === "Phone" ? await prisma.phone.findUnique({ where: { id: entityId }, select: { id: true } }) : await prisma.accessory.findUnique({ where: { id: entityId }, select: { id: true } });
  if (!exists) return { ok: false, error: "Item not found." };
  await prisma.auditLog.create({ data: { action: ITEM_COMMENT_ACTION, entityType, entityId, userId, details: { text: trimmed } } });
  return { ok: true, rows: await listItemComments(entityType, entityId) };
}

/** Authors can delete their own comments; admins can delete any. */
export async function deleteItemComment(commentId: string, actor: { userId?: string; isAdmin: boolean }): Promise<{ ok: true; rows: ItemCommentRow[] } | { ok: false; error: string }> {
  const log = await prisma.auditLog.findUnique({ where: { id: commentId } });
  if (!log || log.action !== ITEM_COMMENT_ACTION) return { ok: false, error: "Comment not found." };
  if (log.userId !== actor.userId && !actor.isAdmin) return { ok: false, error: "You can only delete your own comments." };
  await prisma.auditLog.delete({ where: { id: commentId } });
  return { ok: true, rows: await listItemComments(log.entityType as CommentEntity, log.entityId) };
}

/** Latest comments for many items at once (newest first, up to `perItem` each) — for pickers. */
export async function commentsForItems(entityType: CommentEntity, ids: string[], perItem = 3): Promise<Map<string, ItemCommentRow[]>> {
  const map = new Map<string, ItemCommentRow[]>();
  if (!ids.length) return map;
  const logs = await prisma.auditLog.findMany({
    where: { action: ITEM_COMMENT_ACTION, entityType, entityId: { in: ids } },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, username: true } } },
  });
  for (const log of logs) {
    const list = map.get(log.entityId) ?? [];
    if (list.length < perItem) list.push(toRow(log));
    map.set(log.entityId, list);
  }
  return map;
}
