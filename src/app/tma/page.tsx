import { Suspense } from "react";
import TmaBootstrapClient from "./tma-bootstrap-client";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4">Loading TMA…</div>}>
      <TmaBootstrapClient />
    </Suspense>
  );
}
