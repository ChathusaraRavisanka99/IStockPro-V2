import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSignedDownloadUrl, isStorageKey } from "@/lib/storage";

/**
 * Company profile printed on receipts, invoices and quotations. Every field is optional —
 * anything left blank falls back to the documents' original text, so with nothing configured
 * the printed layout is exactly as before. Stored as append-only AuditLog rows
 * (action "CompanyProfile"); the newest row is the current profile, older rows are its history.
 */
export const COMPANY_PROFILE_ACTION = "CompanyProfile";

export type CompanyProfile = {
  name?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  registrationNo?: string;
  contactPerson?: string;
  contactPersonPhone?: string;
  footerNote?: string;
  /** Storage key of the uploaded logo (PNG/JPEG). */
  logoKey?: string;
};

export const COMPANY_FIELDS: { key: Exclude<keyof CompanyProfile, "logoKey">; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: "name", label: "Company name", placeholder: "IStockPro" },
  { key: "tagline", label: "Tagline", placeholder: "e.g. Phones & accessories" },
  { key: "address", label: "Address", placeholder: "No. 12, Main Street, Colombo 03", multiline: true },
  { key: "phone", label: "Phone", placeholder: "+94 77 123 4567" },
  { key: "email", label: "Email", placeholder: "sales@example.com" },
  { key: "website", label: "Website", placeholder: "www.example.com" },
  { key: "registrationNo", label: "Business reg. / VAT no.", placeholder: "PV 123456" },
  { key: "contactPerson", label: "Contact person", placeholder: "e.g. Nimal Perera" },
  { key: "contactPersonPhone", label: "Contact person phone", placeholder: "+94 71 234 5678" },
  { key: "footerNote", label: "Footer note on documents", placeholder: "e.g. Goods sold are not returnable after 7 days.", multiline: true },
];

/** Current profile (cached per request). */
export const getCompanyProfile = cache(async (): Promise<CompanyProfile> => {
  const row = await prisma.auditLog.findFirst({ where: { action: COMPANY_PROFILE_ACTION }, orderBy: { createdAt: "desc" } });
  const details = (row?.details ?? {}) as CompanyProfile;
  const clean: CompanyProfile = {};
  for (const [key, value] of Object.entries(details)) if (typeof value === "string" && value.trim()) clean[key as keyof CompanyProfile] = value.trim();
  return clean;
});

/** Short-lived URL for showing the logo in a page (null when none is set). */
export async function getCompanyLogoUrl(profile: CompanyProfile): Promise<string | null> {
  if (!profile.logoKey) return null;
  try {
    return isStorageKey(profile.logoKey) ? await getSignedDownloadUrl(profile.logoKey) : profile.logoKey;
  } catch {
    return null;
  }
}

/** Logo bytes for PDFs (react-pdf needs PNG/JPEG data). Null if missing or unreadable. */
export async function getCompanyLogoForPdf(profile: CompanyProfile): Promise<{ data: Buffer; format: "png" | "jpg" } | null> {
  const url = await getCompanyLogoUrl(profile);
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    const format = type.includes("png") ? "png" : type.includes("jpeg") || type.includes("jpg") ? "jpg" : profile.logoKey?.toLowerCase().endsWith(".png") ? "png" : "jpg";
    return { data: Buffer.from(await response.arrayBuffer()), format };
  } catch {
    return null;
  }
}

/** Contact lines under the company name — only the fields that are filled in. */
export function companyContactLines(profile: CompanyProfile): string[] {
  return [
    profile.address,
    [profile.phone, profile.email, profile.website].filter(Boolean).join(" · "),
    profile.registrationNo ? `Reg. no. ${profile.registrationNo}` : "",
    profile.contactPerson ? `Contact: ${profile.contactPerson}${profile.contactPersonPhone ? ` · ${profile.contactPersonPhone}` : ""}` : "",
  ].filter((line): line is string => Boolean(line && line.trim()));
}
