"use client";

import { useEffect } from "react";
import { useProfile } from "@/hooks/data";
import { requestStorageProtection } from "@/lib/storage";

/** Once the learner has a profile (i.e. there is progress worth keeping), ask the browser to keep it. */
export function StorageGuard() {
  const profile = useProfile();
  const hasProfile = Boolean(profile);
  useEffect(() => {
    if (hasProfile) void requestStorageProtection();
  }, [hasProfile]);
  return null;
}
