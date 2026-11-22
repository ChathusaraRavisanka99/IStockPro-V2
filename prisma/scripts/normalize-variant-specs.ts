/**
 * One-off (idempotent) cleanup of PhoneVariant color/storage/RAM values:
 *   - storage/RAM "128" / "128gb" → "128GB"
 *   - storage filled in from the variant name when blank ("11 PRO 256" → "256GB")
 *   - colors title-cased and common typos fixed ("GRAPLITE" → "Graphite")
 *
 * Usage:  npx tsx prisma/scripts/normalize-variant-specs.ts          (dry run)
 *         npx tsx prisma/scripts/normalize-variant-specs.ts --apply  (writes; saves a JSON
 *         snapshot of the original rows to backups/ first)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { buildVariantName, normalizeColor, normalizeRam, normalizeStorage, inferStorageFromName } from "../../src/lib/variant-specs";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const variants = await prisma.phoneVariant.findMany({ include: { phoneModel: true } });
  const changes = variants
    .map((variant) => {
      const storage = normalizeStorage(variant.storage) ?? inferStorageFromName(variant.variantName);
      const ram = normalizeRam(variant.ram);
      const color = normalizeColor(variant.color);
      // A name that was auto-built from the old specs is rebuilt from the corrected ones;
      // names typed by hand are left alone.
      const autoName = variant.variantName === buildVariantName({ storage: variant.storage, ram: variant.ram, color: variant.color });
      const variantName = autoName ? buildVariantName({ storage, ram, color }) : variant.variantName;
      const changed = storage !== variant.storage || ram !== variant.ram || color !== variant.color || variantName !== variant.variantName;
      return changed ? { variant, data: { storage, ram, color, variantName } } : null;
    })
    .filter((change): change is NonNullable<typeof change> => change !== null);

  for (const { variant, data } of changes) {
    console.log(
      `${variant.phoneModel.brand} ${variant.phoneModel.modelName} / ${variant.variantName}: ` +
        `${data.variantName !== variant.variantName ? `name → "${data.variantName}", ` : ""}color ${variant.color ?? "-"} → ${data.color ?? "-"}, storage ${variant.storage ?? "-"} → ${data.storage ?? "-"}, RAM ${variant.ram ?? "-"} → ${data.ram ?? "-"}`
    );
  }
  console.log(`${changes.length} of ${variants.length} variants ${apply ? "updated" : "would change (dry run — pass --apply to write)"}.`);
  if (!apply || !changes.length) return;

  mkdirSync("backups", { recursive: true });
  const snapshot = `backups/variant-specs-before-${Date.now()}.json`;
  writeFileSync(snapshot, JSON.stringify(changes.map(({ variant }) => ({ id: variant.id, variantName: variant.variantName, color: variant.color, storage: variant.storage, ram: variant.ram })), null, 2));
  console.log(`Original values saved to ${snapshot}`);

  await prisma.$transaction(changes.map(({ variant, data }) => prisma.phoneVariant.update({ where: { id: variant.id }, data })));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
