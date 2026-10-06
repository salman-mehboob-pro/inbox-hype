"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// A date in the viewer's own timezone. Empty on the server (it doesn't know the
// viewer's timezone) and filled in as soon as the page is in the browser.
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    () => "",
  );
  return <time dateTime={iso}>{text}</time>;
}
