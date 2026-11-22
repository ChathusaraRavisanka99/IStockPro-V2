// Maps phone marketing color names to an approximate real swatch so color labels can show
// the actual color instead of one generic tint. Pure — safe for server and client.

const NAMED: Record<string, string> = {
  // Apple
  midnight: "#232a31",
  starlight: "#f1ece1",
  "midnight green": "#4e5851",
  "midnight blue": "#2b3543",
  "sierra blue": "#9bb5ce",
  "pacific blue": "#2f4f63",
  "alpine green": "#505f4e",
  "deep purple": "#594f63",
  "space gray": "#5b5c5e",
  "space grey": "#5b5c5e",
  "space black": "#2e2c2e",
  graphite: "#4f4e4b",
  "rose gold": "#e6c2b4",
  coral: "#ee7762",
  "product red": "#bf0013",
  "natural titanium": "#bfb8ad",
  "blue titanium": "#3f4b5c",
  "white titanium": "#f2f1ed",
  "black titanium": "#3b3b3d",
  "desert titanium": "#c9b29b",
  titanium: "#a8a39b",
  // Samsung
  "phantom black": "#2b2b2d",
  "phantom white": "#f2f2ef",
  "phantom silver": "#c9cbcd",
  "phantom violet": "#b8a9c9",
  cream: "#efe6d5",
  lavender: "#c8b6e2",
  "mystic bronze": "#b08d74",
  "awesome black": "#262626",
  "awesome white": "#f4f4f4",
  // Generic
  black: "#1f1f21",
  white: "#f7f7f5",
  silver: "#d6d7d9",
  gray: "#8e8e93",
  grey: "#8e8e93",
  gold: "#e3c79a",
  champagne: "#e9d8b8",
  bronze: "#a97142",
  red: "#c8202f",
  blue: "#2f6fb5",
  navy: "#1f2f55",
  "sky blue": "#8cc4ea",
  "light blue": "#a9cfee",
  teal: "#2a8c8c",
  cyan: "#3ec1d3",
  green: "#3c8d5a",
  mint: "#a8dcc4",
  "light green": "#b3dba8",
  olive: "#6b6f3a",
  yellow: "#f4d34c",
  orange: "#f08a3c",
  pink: "#f2b6c6",
  purple: "#7a5aa8",
  violet: "#8a63c9",
  lilac: "#c9a9dd",
  brown: "#7b5a43",
  beige: "#e5d6bd",
  ivory: "#f4efe1",
};

/** Best-effort swatch for a color name: exact match, then the last word ("Ocean Blue" → blue). */
export function resolvePhoneColor(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (NAMED[key]) return NAMED[key];
  const words = key.split(" ");
  for (let i = 1; i < words.length; i++) {
    const tail = words.slice(i).join(" ");
    if (NAMED[tail]) return NAMED[tail];
  }
  for (const word of words) if (NAMED[word]) return NAMED[word];
  // Tolerate a one-letter typo in longer names ("Graphie" → graphite).
  if (key.length >= 5) {
    for (const [name, hex] of Object.entries(NAMED)) if (Math.abs(name.length - key.length) <= 1 && editDistance(name, key) <= 1) return hex;
  }
  return null;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

/** Relative luminance check so chip text stays readable on the swatch. */
export function isLightColor(hex: string): boolean {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3;
}
