export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8" aria-busy="true" aria-label="กำลังโหลดหน้า">
      <div className="mb-6 h-10 w-64 animate-pulse rounded-ctl bg-surface-muted" />
      <ul className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="h-20 animate-pulse rounded-card bg-surface-muted" />
        ))}
      </ul>
    </main>
  );
}