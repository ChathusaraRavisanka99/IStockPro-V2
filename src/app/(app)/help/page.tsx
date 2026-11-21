import Link from "next/link";
import { ArrowRight, LifeBuoy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { TUTORIALS } from "@/lib/tutorials";

const GROUPS: { title: string; ids: string[] }[] = [
  { title: "Getting started", ids: ["dashboard", "help"] },
  { title: "Stock", ids: ["lots", "lot", "phones", "variant", "catalog", "priceHistory", "accessories"] },
  { title: "Selling", ids: ["sales", "sale", "quotations", "quotation", "returns", "customers", "customer"] },
  { title: "Money & admin", ids: ["suppliers", "expenses", "taxPayments", "reports", "recycleBin", "settings"] },
];

const FAQ: { q: string; a: string }[] = [
  { q: "How do I add a batch of phones?", a: "Create a lot (Lots page), open it, and use Register Phones: pick the variant, scan each IMEI, Add to Batch, then Register. That also builds the lot's goods cost." },
  { q: "A variant doesn't exist yet — what do I do?", a: "In the variant picker, use \"Create new variant\" at the bottom of the list. Pick the model and optionally storage, RAM and color; the name is built for you if you leave it blank." },
  { q: "I deleted something by mistake.", a: "Open the Recycle Bin (admins and managers). Anything deleted in the last 30 days can be restored. If something blocks the restore, the item shows what and links you to it." },
  { q: "Can I reuse the IMEI of a deleted phone?", a: "Yes. IMEIs only have to be unique among active units, so a deleted unit's IMEI can be registered again." },
  { q: "Why can't I see costs or profit?", a: "Costs, margins, profit and reports are only shown to admins and managers. Ask an admin to change your role in Settings if you need them." },
  { q: "Why does it ask for my password?", a: "Destructive or retroactive actions — deleting a lot or customer, editing a unit's cost after its lot has shipped — ask you to confirm it's you." },
  { q: "How do I move a variant to the right model?", a: "Open the variant (click it on the Phones page), press Edit and choose a different Phone model. Its units move with it." },
  { q: "Does it work on my phone?", a: "Yes — every page works on phones and tablets. Popups open as bottom sheets, and wide tables scroll sideways." },
];

export default function HelpPage() {
  const byId = new Map(TUTORIALS.map((tutorial) => [tutorial.id, tutorial]));
  return (
    <div>
      <PageHeader title="Help & tutorials" subtitle="Step-by-step guides for every page, answers to common questions, and support" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4 lg:col-span-2">
          {GROUPS.map((group) => (
            <Card key={group.title}>
              <h2 className="mb-3 text-lg font-semibold">{group.title}</h2>
              <div className="grid gap-2">
                {group.ids.map((id) => {
                  const tutorial = byId.get(id);
                  if (!tutorial) return null;
                  return (
                    <details key={id} className="group rounded-xl border border-slate-200 bg-white open:shadow-sm">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900">{tutorial.title}</span>
                          <span className="block text-sm text-slate-500">{tutorial.summary}</span>
                        </span>
                        <span className="shrink-0 text-slate-400 transition group-open:rotate-90">›</span>
                      </summary>
                      <div className="border-t border-slate-100 px-4 py-3">
                        {tutorial.access ? <p className="mb-2 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{tutorial.access}</p> : null}
                        <ol className="grid gap-2.5">
                          {tutorial.steps.map((step, index) => (
                            <li key={step.title} className="flex gap-3">
                              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{index + 1}</span>
                              <span className="min-w-0 text-sm">
                                <span className="font-medium text-slate-900">{step.title}. </span>
                                <span className="text-slate-700">{step.body}</span>
                              </span>
                            </li>
                          ))}
                        </ol>
                        {tutorial.tips?.length ? (
                          <ul className="mt-3 list-disc space-y-1 rounded-lg bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">
                            {tutorial.tips.map((tip) => (
                              <li key={tip}>{tip}</li>
                            ))}
                          </ul>
                        ) : null}
                        {tutorial.id !== "help" ? (
                          <Link href={tutorial.path} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-slate-800 underline">
                            Go to {tutorial.title.replace(/ details$/, "")} <ArrowRight className="size-3.5" />
                          </Link>
                        ) : null}
                      </div>
                    </details>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <h2 className="mb-3 text-lg font-semibold">Common questions</h2>
            <div className="grid gap-2">
              {FAQ.map((item) => (
                <details key={item.q} className="group rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <summary className="cursor-pointer list-none text-sm font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                    <span className="mr-1 text-slate-400 group-open:hidden">+</span>
                    <span className="mr-1 hidden text-slate-400 group-open:inline">−</span>
                    {item.q}
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{item.a}</p>
                </details>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
              <LifeBuoy className="size-5 text-slate-500" /> Need more help?
            </h2>
            <ul className="grid gap-2 text-sm text-slate-700">
              <li>Every page has a <b>How to use this page</b> button under its title, and small <b>(i)</b> icons that explain each section.</li>
              <li>For access, roles or a forgotten password, ask an <b>admin</b> — they manage users in Settings.</li>
              <li>Something not working? Note the page, what you clicked and any message shown, and send it to your admin or system support.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
