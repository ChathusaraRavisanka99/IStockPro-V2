/** Server-rendered ★ toggle for a lot; posts to the given server action (works without JS). */
export function BookmarkButton({ lotId, bookmarked, action, withLabel }: { lotId: string; bookmarked: boolean; action: (formData: FormData) => Promise<void>; withLabel?: boolean }) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="lotId" value={lotId} />
      <button
        type="submit"
        title={bookmarked ? "Remove bookmark" : "Bookmark this lot"}
        aria-label={bookmarked ? "Remove bookmark" : "Bookmark this lot"}
        className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-1.5 py-1 text-base leading-none transition ${bookmarked ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-amber-500"} ${withLabel ? "border border-slate-300 text-sm" : ""}`}
      >
        {bookmarked ? "★" : "☆"}
        {withLabel ? <span className="ml-1 text-sm text-slate-700">{bookmarked ? "Bookmarked" : "Bookmark"}</span> : null}
      </button>
    </form>
  );
}
