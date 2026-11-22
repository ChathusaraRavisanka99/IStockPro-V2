"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { addItemComment, deleteItemComment, listItemComments, type CommentEntity, type ItemCommentRow } from "@/lib/item-comments";

export type ViewerComment = ItemCommentRow & { canDelete: boolean };
type Result = { ok: true; rows: ViewerComment[] } | { ok: false; error: string };

async function viewer() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error) return null;
  return { userId: session.user.id, isAdmin: session.user.role === "admin" };
}

const withPermissions = (rows: ItemCommentRow[], actor: { userId: string; isAdmin: boolean }): ViewerComment[] => rows.map((row) => ({ ...row, canDelete: actor.isAdmin || row.authorId === actor.userId }));

const ENTITIES: CommentEntity[] = ["Phone", "Accessory"];

export async function listCommentsAction(entityType: CommentEntity, entityId: string): Promise<ViewerComment[]> {
  const actor = await viewer();
  if (!actor || !ENTITIES.includes(entityType)) return [];
  return withPermissions(await listItemComments(entityType, entityId), actor);
}

export async function addCommentAction(entityType: CommentEntity, entityId: string, text: string): Promise<Result> {
  const actor = await viewer();
  if (!actor) return { ok: false, error: "Sign in again to comment." };
  if (!ENTITIES.includes(entityType)) return { ok: false, error: "Unknown item." };
  const result = await addItemComment(entityType, entityId, text, actor.userId);
  return result.ok ? { ok: true, rows: withPermissions(result.rows, actor) } : result;
}

export async function deleteCommentAction(commentId: string): Promise<Result> {
  const actor = await viewer();
  if (!actor) return { ok: false, error: "Sign in again." };
  const result = await deleteItemComment(commentId, actor);
  return result.ok ? { ok: true, rows: withPermissions(result.rows, actor) } : result;
}
