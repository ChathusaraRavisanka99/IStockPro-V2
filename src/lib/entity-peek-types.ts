import type { EditorField } from "@/components/ui/entity-editor";

export type EntityKind = "lot" | "supplier" | "customer" | "model" | "variant" | "accessory" | "phone" | "sale";

export type PeekFact = { label: string; value: string; link?: { kind: EntityKind; id: string } };

export type PeekData = {
  kind: EntityKind;
  id: string;
  title: string;
  subtitle?: string;
  /** Full page for this record. */
  href: string;
  deleted?: boolean;
  chips?: { color: string | null; storage: string | null; ram: string | null };
  facts: PeekFact[];
  /** Editable fields when the record can be edited from the popup. */
  edit?: { title: string; fields: EditorField[] };
  /** Explanation shown instead of an Edit button. */
  editHint?: string;
  username?: string;
};
