"use client";

import { ErrorScreen } from "@/components/shelf/ErrorScreen";

export default function ErrorBoundary({ error }: { error: Error & { digest?: string } }) {
  return <ErrorScreen error={error} />;
}
