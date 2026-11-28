import { Card } from "@/components/ui/card";
import { MobileNav } from "@/components/ui/mobile-nav";
import { SaleForm } from "@/components/sales/sale-form";
import { QuotationForm } from "@/components/quotations/quotation-form";
import { LotRegisterForm } from "@/components/items/lot-register-form";
import { LONG_NAME, sampleItems } from "../fixtures";

async function noopVoid() {
  "use server";
}
async function noVariant(): Promise<{ ok: false; error: string }> {
  "use server";
  return { ok: false, error: "UI test harness — nothing is saved." };
}


const variants = [
  { id: "v1", phoneModelId: "m1", brand: "Apple", modelName: "iPhone 13 Pro Max", variantName: "256GB · 6GB RAM · Sierra Blue", color: "Sierra Blue", storage: "256GB", ram: "6GB", inStock: 3 },
  { id: "v2", phoneModelId: "m1", brand: "Apple", modelName: "iPhone 13 Pro Max", variantName: "128GB · Graphite", color: "Graphite", storage: "128GB", ram: null, inStock: 0 },
];

/** The big forms (new sale, new quotation, register units into a lot) inside the Full shell. */
export default function UiTestFormsPage() {
  const customers = [{ value: "c1", label: `${LONG_NAME} · +94 77 123 4567` }];
  const customerQuickAdd = { label: "Customer", action: noopVoid, fields: [{ name: "name", label: "Name", required: true }] };
  return (
    <main className="min-w-0 p-3 sm:p-6 lg:p-8">
      <MobileNav name={LONG_NAME} role="admin" />
      <div className="glass-panel rounded-2xl border border-white/90 p-3 sm:rounded-3xl sm:p-6 lg:p-8" data-testid="harness-ready">
        <h1 className="mb-3 text-xl font-semibold">Forms</h1>
        <Card className="mb-4" data-testid="sale-form">
          <SaleForm customers={customers} customerQuickAdd={customerQuickAdd} items={sampleItems} action={noopVoid} />
        </Card>
        <Card className="mb-4" data-testid="quote-form">
          <QuotationForm customers={customers} customerQuickAdd={customerQuickAdd} items={sampleItems} action={noopVoid} />
        </Card>
        <Card data-testid="lot-form">
          <LotRegisterForm
            variants={variants}
            imeiOwners={{}}
            showCost
            allowGrading
            action={noopVoid}
            createVariant={noVariant}
            models={[{ id: "m1", label: "Apple iPhone 13 Pro Max" }]}
            modelQuickAdd={{ label: "Model", action: noopVoid, fields: [{ name: "brand", label: "Brand", required: true }] }}
          />
        </Card>
      </div>
    </main>
  );
}
