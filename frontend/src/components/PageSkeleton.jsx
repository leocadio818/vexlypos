/**
 * PageSkeleton — Animated loading skeleton for instant page transitions
 * Shows immediately while the real page loads data
 */
export default function PageSkeleton() {
  return (
    <div className="h-full p-4 md:p-6 space-y-4 animate-pulse" data-testid="page-skeleton">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-5 w-48 rounded-lg bg-muted" />
          <div className="h-3 w-32 rounded-lg bg-muted/60" />
        </div>
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 rounded-xl bg-muted border border-border/50" />
        ))}
      </div>

      {/* Content area skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 rounded-xl bg-muted border border-border/50" />
        <div className="h-64 rounded-xl bg-muted border border-border/50" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl bg-muted border border-border/50 overflow-hidden">
        <div className="h-10 bg-muted/80" />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-12 border-t border-border/30" />
        ))}
      </div>
    </div>
  );
}
