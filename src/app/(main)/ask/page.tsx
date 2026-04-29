import { Suspense } from "react";
import AskClient from "./AskClient";

function AskFallback() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center text-accent text-sm">
      Loading…
    </div>
  );
}

export default function AskPage() {
  return (
    <Suspense fallback={<AskFallback />}>
      <AskClient />
    </Suspense>
  );
}
