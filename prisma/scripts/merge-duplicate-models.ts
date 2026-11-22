/**
 * One-off cleanup of duplicate phone models/variants (Nov 2026).
 *
 * Models that were entered several times with different spellings ("13", "APPLE 13",
 * "IPHONE 13", "IPHONE"...) are consolidated into one canonical model each
 * ("Apple iPhone 13", "Apple iPhone 13 Pro", ...). Inside each canonical model, variants
 * with the same storage + RAM + color are merged into one; units and quotation lines are
 * moved onto the surviving variant, and every live variant is renamed to the standard
 * "128GB · Red" form. Emptied duplicate models/variants are removed.
 *
 * Usage:  npx tsx prisma/scripts/merge-duplicate-models.ts           (dry run — prints the plan)
 *         npx tsx prisma/scripts/merge-duplicate-models.ts --apply   (writes; JSON snapshot of
 *         every model, variant, unit→variant link and quotation line saved to backups/ first)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { buildVariantName } from "../../src/lib/variant-specs";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

type Target = { key: string; brand: string; modelName: string; reuseModelId?: string };

const TARGETS: Target[] = [
  { key: "11", brand: "Apple", modelName: "iPhone 11", reuseModelId: "cmvxv41cr0000le045jdtun9w" },
  { key: "11pro", brand: "Apple", modelName: "iPhone 11 Pro" },
  { key: "12pro", brand: "Apple", modelName: "iPhone 12 Pro", reuseModelId: "cmtgoodsf0000jt04ong8m48c" },
  { key: "13", brand: "Apple", modelName: "iPhone 13", reuseModelId: "cmtph1o8b0002kz042ye7hmyk" },
  { key: "13pro", brand: "Apple", modelName: "iPhone 13 Pro", reuseModelId: "cmvxvs2ha0009le04ajxh45pm" },
  { key: "14", brand: "Apple", modelName: "iPhone 14", reuseModelId: "cmt6xancj0001etpwnz8m05wv" },
];

/** Variant id → target model key (decided from each variant's name; see header). */
const VARIANT_TARGET: Record<string, string> = {
  // Apple | 12 pro
  cmtgoyo2w0001l304klfzmjco: "12pro",
  cmwrt11ms0001lb08nh185fpr: "12pro",
  // Apple | 13
  cmvxuu1tw0001l905zhuduidl: "13", // deleted "APPLE13" — kept with its model
  cmvxv5kcc0004le04eqp3id8v: "13",
  cmtzefxqi0003jm045mi0kxxj: "13",
  cmvz3f8kn0001jl0458s33kuv: "13",
  // Apple | iPhone 14
  cmt6xao1e0003etpwy2la5w3q: "14",
  cmtkex38c000aetss991nal9f: "14",
  cmwg9nsfe0003jt085kdze110: "14",
  cmwgd1fev0001jh072op73jbi: "14",
  // APPLE | 11
  cmvxv525f0002le046wdnl2kq: "11",
  cmwg9f1sb0001l008umv0b9sq: "11pro",
  cmwga5gg60003kz07kq3c86zg: "11pro",
  // APPLE | 13
  cmvxvc4ld0002if047r16dasp: "13",
  cmwgbvd1x0001l407ezz1nr6t: "13pro",
  cmwgaedau0006kz07nitrvtkf: "13pro",
  // APPLE | IPHONE
  cmvxvusxa000hle04mdgwa1ut: "13",
  cmvxvnr0k0007if0433alvrcl: "13",
  // APPLE | IPHONE 12
  cmwgcb1w90009l407zgmgm1st: "12pro",
  cmwgb8o4m0002k108vesqw4et: "12pro",
  // APPLE | IPHONE 13
  cmvxvsnie000ble047i54hb1u: "13",
  cmwgcwmd70001l6077e7scwkv: "13pro",
  cmwgc7y9m0007l407p9x71nsx: "13pro",
  // APPLE | IPHONE 14
  cmwgck7wy000dl407nup7py94: "14",
  cmwrrqx9t0001kz08f1t4zm4i: "14",
};

/** Duplicate models that end up empty and are removed. */
const REMOVE_MODELS = ["cmtph0ptp0000kz04nosa2ytt", "cmvxvba310000if04o9ugnx29", "cmvxvnet50005if04fdy8dro2", "cmwgb78xh0000k108y2o1e3pm", "cmwg9lu3k0001jt08rd9uhxfv"];

const specKey = (v: { storage: string | null; ram: string | null; color: string | null }) => [v.storage, v.ram, v.color].map((x) => (x ?? "").toLowerCase()).join("|");

async function main() {
  const variantIds = Object.keys(VARIANT_TARGET);
  const variants = await prisma.phoneVariant.findMany({
    where: { id: { in: variantIds } },
    include: { phoneModel: true, _count: { select: { phones: true, quotationItems: true } } },
  });
  const missing = variantIds.filter((id) => !variants.some((v) => v.id === id));
  if (missing.length) throw new Error(`Variants not found (data changed since the plan was made): ${missing.join(", ")}`);

  const involvedModelIds = Array.from(new Set([...variants.map((v) => v.phoneModelId), ...REMOVE_MODELS, ...TARGETS.map((t) => t.reuseModelId).filter(Boolean) as string[]]));
  const models = await prisma.phoneModel.findMany({ where: { id: { in: involvedModelIds } } });
  const extraVariants = await prisma.phoneVariant.findMany({ where: { phoneModelId: { in: REMOVE_MODELS }, id: { notIn: variantIds } } });
  if (extraVariants.length) throw new Error(`Models to remove have unplanned variants: ${extraVariants.map((v) => v.id).join(", ")}`);

  // Plan the variant merges per target.
  type Plan = { target: Target; keep: (typeof variants)[number]; name: string; merge: (typeof variants)[number][] };
  const plans: Plan[] = [];
  const deletedMoves: (typeof variants)[number][] = [];
  for (const target of TARGETS) {
    const inTarget = variants.filter((v) => VARIANT_TARGET[v.id] === target.key);
    const live = inTarget.filter((v) => !v.deletedAt);
    deletedMoves.push(...inTarget.filter((v) => v.deletedAt));
    const groups = new Map<string, typeof live>();
    for (const v of live) groups.set(specKey(v), [...(groups.get(specKey(v)) ?? []), v]);
    for (const group of Array.from(groups.values())) {
      // Survivor: the one with most units (ties: oldest).
      const sorted = [...group].sort((a, b) => b._count.phones - a._count.phones || a.createdAt.getTime() - b.createdAt.getTime());
      const keep = sorted[0];
      plans.push({ target, keep, name: buildVariantName(keep), merge: sorted.slice(1) });
    }
  }

  // Print the plan.
  for (const target of TARGETS) {
    const reuse = target.reuseModelId ? models.find((m) => m.id === target.reuseModelId) : null;
    console.log(`\n${target.brand} ${target.modelName}  ${reuse ? `(renamed from "${reuse.brand} ${reuse.modelName}")` : "(new model)"}`);
    for (const plan of plans.filter((p) => p.target === target)) {
      const units = plan.keep._count.phones + plan.merge.reduce((s, v) => s + v._count.phones, 0);
      console.log(`   • ${plan.name.padEnd(28)} ← "${plan.keep.variantName}" [${plan.keep.phoneModel.brand} ${plan.keep.phoneModel.modelName}]${plan.merge.map((v) => ` + "${v.variantName}" [${v.phoneModel.brand} ${v.phoneModel.modelName}]`).join("")}  (${units} unit${units === 1 ? "" : "s"})`);
    }
  }
  console.log(`\nRemove empty duplicate models: ${REMOVE_MODELS.map((id) => { const m = models.find((x) => x.id === id); return m ? `"${m.brand} ${m.modelName}"` : id; }).join(", ")}`);
  if (!apply) {
    console.log("\nDry run — pass --apply to write.");
    return;
  }

  // Snapshot everything touched.
  mkdirSync("backups", { recursive: true });
  const snapshot = `backups/merge-duplicate-models-before-${Date.now()}.json`;
  const allVariantIds = variants.map((v) => v.id);
  writeFileSync(
    snapshot,
    JSON.stringify(
      {
        models,
        variants: await prisma.phoneVariant.findMany({ where: { id: { in: allVariantIds } } }),
        phones: await prisma.phone.findMany({ where: { phoneVariantId: { in: allVariantIds } }, select: { id: true, imei: true, phoneVariantId: true } }),
        quotationItems: await prisma.quotationItem.findMany({ where: { OR: [{ phoneVariantId: { in: allVariantIds } }, { phoneModelId: { in: involvedModelIds } }] }, select: { id: true, phoneVariantId: true, phoneModelId: true } }),
      },
      null,
      2
    )
  );
  console.log(`\nSnapshot saved to ${snapshot}`);

  await prisma.$transaction(async (tx) => {
    // 1. Free the canonical names on the models being removed, then rename/create targets.
    const targetModelIds = new Map<string, string>();
    for (const target of TARGETS) {
      const merged = variants.filter((v) => VARIANT_TARGET[v.id] === target.key).map((v) => models.find((m) => m.id === v.phoneModelId)!);
      const lowStockThreshold = Math.max(3, ...merged.map((m) => m.lowStockThreshold));
      const warrantyMonths = Math.max(0, ...merged.map((m) => m.warrantyMonths));
      if (target.reuseModelId) {
        await tx.phoneModel.update({ where: { id: target.reuseModelId }, data: { brand: target.brand, modelName: target.modelName, lowStockThreshold, warrantyMonths, deletedAt: null } });
        targetModelIds.set(target.key, target.reuseModelId);
      } else {
        const created = await tx.phoneModel.create({ data: { brand: target.brand, modelName: target.modelName, lowStockThreshold, warrantyMonths } });
        targetModelIds.set(target.key, created.id);
      }
    }

    // 2. Give every involved variant a temporary unique name so renames can't collide.
    for (const v of variants) await tx.phoneVariant.update({ where: { id: v.id }, data: { variantName: `__merge_${v.id}` } });

    // 3. Merge duplicates into survivors; move survivors (and deleted variants) to their target.
    for (const plan of plans) {
      const modelId = targetModelIds.get(plan.target.key)!;
      for (const dup of plan.merge) {
        await tx.phone.updateMany({ where: { phoneVariantId: dup.id }, data: { phoneVariantId: plan.keep.id } });
        await tx.quotationItem.updateMany({ where: { phoneVariantId: dup.id }, data: { phoneVariantId: plan.keep.id, phoneModelId: modelId } });
        await tx.phoneVariant.delete({ where: { id: dup.id } });
      }
      await tx.phoneVariant.update({ where: { id: plan.keep.id }, data: { phoneModelId: modelId, variantName: plan.name } });
      await tx.quotationItem.updateMany({ where: { phoneVariantId: plan.keep.id }, data: { phoneModelId: modelId } });
    }
    for (const v of deletedMoves) {
      await tx.phoneVariant.update({ where: { id: v.id }, data: { phoneModelId: targetModelIds.get(VARIANT_TARGET[v.id])!, variantName: `${v.variantName} (old)` } });
    }

    // 4. Remove the emptied duplicate models (quotation lines pointing at them move first).
    for (const id of REMOVE_MODELS) {
      await tx.quotationItem.updateMany({ where: { phoneModelId: id }, data: { phoneModelId: targetModelIds.get("13")! } });
      await tx.phoneModel.delete({ where: { id } });
    }
  }, { timeout: 60_000 });

  console.log("Applied.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
