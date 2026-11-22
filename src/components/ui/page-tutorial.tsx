"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Lightbulb, X } from "lucide-react";
import { Modal, modalButton } from "@/components/ui/modal";
import { tutorialForPath, type Tutorial } from "@/lib/tutorials";

const SEEN_KEY = (id: string) => `istockpro-tutorial-seen:${id}`;

export function TutorialDialog({ tutorial, onClose }: { tutorial: Tutorial; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const total = tutorial.steps.length;
  const last = step === total - 1;
  const current = tutorial.steps[step];

  return (
    <Modal
      title={`How to use: ${tutorial.title}`}
      subtitle={tutorial.summary}
      icon={<GraduationCap className="size-4" />}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">
            Step {step + 1} of {total}
          </span>
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)} className={modalButton.secondary}>
              Back
            </button>
          ) : null}
          <button type="button" data-autofocus onClick={() => (last ? onClose() : setStep(step + 1))} className={modalButton.primary}>
            {last ? "Done" : "Next"}
          </button>
        </>
      }
    >
      {tutorial.access ? <p className="mb-3 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{tutorial.access}</p> : null}

      <div className="mb-4 flex gap-1.5" aria-hidden="true">
        {tutorial.steps.map((_, index) => (
          <button
            key={index}
            type="button"
            tabIndex={-1}
            onClick={() => setStep(index)}
            className={`h-1.5 flex-1 rounded-full transition ${index <= step ? "bg-slate-900" : "bg-slate-200 hover:bg-slate-300"}`}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{step + 1}</span>
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-slate-900">{current.title}</h4>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{current.body}</p>
        </div>
      </div>

      {last && tutorial.tips?.length ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <Lightbulb className="size-3.5" /> Tips
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
            {tutorial.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-5 text-xs text-slate-500">
        More guides and support on the{" "}
        <Link href="/help" onClick={onClose} className="font-medium text-slate-700 underline">
          Help page
        </Link>
        .
      </p>
    </Modal>
  );
}

/**
 * "How to use this page" button (rendered by PageHeader on every page, matched by URL) plus a
 * one-time "Take the tour" banner on a page's first visit in this browser.
 */
export function PageTutorial() {
  const pathname = usePathname();
  const tutorial = tutorialForPath(pathname);
  const [open, setOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!tutorial) return;
    try {
      setShowBanner(!window.localStorage.getItem(SEEN_KEY(tutorial.id)));
    } catch {
      setShowBanner(false);
    }
  }, [tutorial]);

  if (!tutorial) return null;

  function markSeen() {
    setShowBanner(false);
    try {
      window.localStorage.setItem(SEEN_KEY(tutorial!.id), "1");
    } catch {
      // storage unavailable
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          markSeen();
        }}
        className="btn btn-xs btn-secondary print:hidden"
      >
        <GraduationCap className="size-3.5" />
        How to use this page
      </button>
      {showBanner ? (
        <div className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xl print:hidden lg:left-auto lg:right-6 lg:translate-x-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
            <GraduationCap className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium text-slate-900">New to {tutorial.title}?</span>
            <span className="block text-slate-500">Take the {tutorial.steps.length}-step tour.</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              markSeen();
            }}
            className={modalButton.primary}
          >
            Start
          </button>
          <button type="button" onClick={markSeen} aria-label="Dismiss" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      {open ? <TutorialDialog tutorial={tutorial} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
