// Pure helpers (safe for client and server) that keep variant color/storage/RAM values
// consistent, so filters group "128", "128gb" and "128GB" together and colors don't
// split on casing ("RED" vs "Red").

const COLOR_FIXES: Record<string, string> = {
  graplite: "Graphite",
  midnightgreen: "Midnight Green",
  midnightblue: "Midnight Blue",
  spacegray: "Space Gray",
  spacegrey: "Space Grey",
  rosegold: "Rose Gold",
  sierrablue: "Sierra Blue",
  pacificblue: "Pacific Blue",
  alpinegreen: "Alpine Green",
  deeppurple: "Deep Purple",
  phantomblack: "Phantom Black",
};

function sizeValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const gb = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:g|gb)?$/i);
  if (gb) return `${gb[1]}GB`;
  const tb = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:t|tb)$/i);
  if (tb) return `${tb[1]}TB`;
  const mb = trimmed.match(/^(\d+(?:\.\d+)?)\s*mb$/i);
  if (mb) return `${mb[1]}MB`;
  return trimmed;
}

/** "128" / "128 gb" / "128GB" → "128GB"; "1tb" → "1TB". Anything else is just trimmed. */
export function normalizeStorage(value: string | null | undefined): string | null {
  return sizeValue(value);
}

/** Same rules as storage: "6" / "6gb" → "6GB". */
export function normalizeRam(value: string | null | undefined): string | null {
  return sizeValue(value);
}

/** Title-cases a color and fixes common run-together/typo spellings ("MIDNIGHTGREEN"). */
export function normalizeColor(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const fixed = COLOR_FIXES[trimmed.toLowerCase().replace(/[\s-]/g, "")];
  if (fixed) return fixed;
  return trimmed
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Pulls a storage size out of a free-text variant name, e.g. "11 PRO 256" → "256GB". */
export function inferStorageFromName(name: string): string | null {
  const tb = name.match(/\b(1|2)\s*TB\b/i);
  if (tb) return `${tb[1]}TB`;
  const gb = name.match(/\b(16|32|64|128|256|512)\s*(?:GB)?\b/i);
  return gb ? `${gb[1]}GB` : null;
}

/** Variant name used when the user leaves it blank: "128GB · 6GB RAM · Red", or "Standard". */
export function buildVariantName(specs: { storage?: string | null; ram?: string | null; color?: string | null }): string {
  const parts = [specs.storage, specs.ram ? `${specs.ram} RAM` : null, specs.color].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : "Standard";
}

/** Sort sizes numerically (64GB < 128GB < 1TB); non-size values sort alphabetically after. */
export function compareSizes(a: string, b: string): number {
  const toGb = (value: string) => {
    const match = value.match(/^(\d+(?:\.\d+)?)(MB|GB|TB)$/i);
    if (!match) return Number.POSITIVE_INFINITY;
    const n = Number(match[1]);
    const unit = match[2].toUpperCase();
    return unit === "TB" ? n * 1024 : unit === "MB" ? n / 1024 : n;
  };
  const diff = toGb(a) - toGb(b);
  return Number.isFinite(diff) && diff !== 0 ? diff : a.localeCompare(b);
}
