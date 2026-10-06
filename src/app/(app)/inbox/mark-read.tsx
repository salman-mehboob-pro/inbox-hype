"use client";

import { useEffect } from "react";
import { markMessageRead } from "./actions";

// Opening a message marks it as read (once).
export function MarkRead({ id }: { id: string }) {
  useEffect(() => {
    void markMessageRead(id);
  }, [id]);
  return null;
}
