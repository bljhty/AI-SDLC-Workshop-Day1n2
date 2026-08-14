"use client";

import { useCallback, useEffect, useState } from "react";
import type { Todo } from "@/lib/db";

const POLL_INTERVAL_MS = 30_000;

export type NotificationPermissionState = "unsupported" | NotificationPermission;

/**
 * Polls for due reminders every 30s and fires browser notifications once
 * permission is granted. Permission is requested only via the returned
 * `requestPermission()` — call it from a user gesture (a button click),
 * never automatically, since browsers require (and users expect) an
 * explicit action before a permission prompt appears.
 */
export function useNotifications(enabled: boolean) {
  const [permission, setPermission] = useState<NotificationPermissionState>("default");

  useEffect(() => {
    // Synchronizing with an external system (the browser's live Notification
    // permission, which SSR can't see) is exactly what an effect is for —
    // the read is intentionally deferred to after mount so the client's
    // first render matches the server's, rather than mismatching on hydration.
    if (typeof window === "undefined" || !("Notification" in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  useEffect(() => {
    if (!enabled || permission !== "granted") return;

    async function poll() {
      try {
        const res = await fetch("/api/notifications/check");
        if (!res.ok) return;
        const due: Todo[] = await res.json();
        for (const todo of due) {
          new Notification("Todo reminder", {
            body: todo.due_date ? `${todo.title} — due ${todo.due_date.replace("T", " ")}` : todo.title,
          });
        }
      } catch {
        // Transient network error — the next poll retries.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, permission]);

  return { permission, requestPermission };
}
