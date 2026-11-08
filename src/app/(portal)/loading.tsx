/** Shown the instant you tap a link, while the page's numbers load. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4 sm:space-y-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-line" />
        <div className="h-4 w-72 max-w-full rounded-md bg-line/70" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[118px] p-5">
            <div className="h-3.5 w-20 rounded bg-line" />
            <div className="mt-4 h-6 w-32 max-w-full rounded-md bg-line" />
          </div>
        ))}
      </div>
      <div className="card p-5">
        <div className="h-4 w-36 rounded bg-line" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-9 w-9 shrink-0 rounded-xl bg-line/80" />
              <div className="h-3.5 flex-1 rounded bg-line/70" />
              <div className="h-3.5 w-20 rounded bg-line/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
