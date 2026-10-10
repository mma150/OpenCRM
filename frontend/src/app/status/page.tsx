import { HealthStatus } from "@/features/health/health-status";

// The API status page. It needs no sign-in, so it works even when login is broken.
export default function StatusPage() {
  return (
    <main className="mx-auto w-full max-w-xl p-4 wrap-anywhere sm:p-8">
      <HealthStatus />
    </main>
  );
}
