"use client";

import { QuoteIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { splitQuotedHtml, splitQuotedText } from "@/lib/inbox/quote";

// The whole message: what the person wrote, and the quoted older messages
// behind a "Show quoted text" button (like most mail apps).
export function MessageBody({ html, text, title }: { html: string | null; text: string | null; title: string }) {
  const [showQuoted, setShowQuoted] = useState(false);

  const { main, quoted } = html ? splitQuotedHtml(html) : splitQuotedText(text ?? "");

  return (
    <div className="grid gap-2">
      {html ? (
        // Showing everything is the original message, unchanged.
        <EmailFrame html={showQuoted ? html : main} title={title} />
      ) : (
        <>
          <pre className="font-sans text-sm whitespace-pre-wrap">{main.trim() || "(empty message)"}</pre>
          {showQuoted && quoted && (
            <pre className="border-l-2 pl-3 font-sans text-sm whitespace-pre-wrap text-muted-foreground">
              {quoted.trim()}
            </pre>
          )}
        </>
      )}
      {quoted && (
        <div>
          <Button variant="outline" size="sm" onClick={() => setShowQuoted((v) => !v)} aria-expanded={showQuoted}>
            <QuoteIcon />
            {showQuoted ? "Hide quoted text" : "Show quoted text"}
          </Button>
        </div>
      )}
    </div>
  );
}

// An email's HTML in a sandboxed frame: no scripts can run, links open in a new
// tab. `allow-same-origin` is safe because scripts are not allowed, and it lets us
// size the frame to its content, so the whole message is visible with no inner
// scrollbar. The size is followed while the content changes (images loading,
// the frame being shown after it was hidden inside a closed <details>).
function EmailFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const [height, setHeight] = useState(48);

  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    html,body{overflow:hidden}
    body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;margin:0;padding:8px;word-wrap:break-word}
    p{margin:0 0 .75em} img{max-width:100%;height:auto} blockquote{border-left:3px solid #ddd;margin:0 0 .75em;padding-left:.75em;color:#555}
    body>*:last-child{margin-bottom:0}
  </style></head><body>${html}</body></html>`;

  function follow() {
    stop.current?.();
    const frame = ref.current;
    const inner = frame?.contentDocument;
    const win = frame?.contentWindow as (Window & typeof globalThis) | null;
    if (!inner?.documentElement || !win) return;

    // +2 = the frame's own 1px border (the frame is border-box).
    const measure = () => setHeight(Math.max(Math.ceil(inner.documentElement.scrollHeight) + 2, 48));
    measure();
    const observer = new win.ResizeObserver(measure);
    observer.observe(inner.documentElement);
    const images = [...inner.images];
    images.forEach((img) => img.addEventListener("load", measure));
    stop.current = () => {
      observer.disconnect();
      images.forEach((img) => img.removeEventListener("load", measure));
    };
  }

  useEffect(() => () => stop.current?.(), []);

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-same-origin allow-popups"
      srcDoc={doc}
      scrolling="no"
      style={{ height }}
      className="w-full rounded-md border bg-white"
      onLoad={follow}
    />
  );
}
