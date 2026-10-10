"use client";

import { useCallback, useEffect, useState } from "react";
import { getStatus, type ServerStatus } from "@/lib/api";

/** GET /status once, and again on refresh. `status` is undefined while it loads and null when the server cannot be reached. */
export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus | null | undefined>(undefined);
  const refresh = useCallback(async () => {
    setStatus(await getStatus());
  }, []);
  useEffect(() => {
    let live = true;
    getStatus().then((s) => {
      if (live) setStatus(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return { status, refresh };
}
