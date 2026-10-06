"use client";

import { useRef, useState } from "react";

// An email's HTML in a sandboxed frame: no scripts can run, links open in a
// new tab. `allow-same-origin` is safe here because scripts are not allowed,
// and it lets us size the frame to its content.
export function EmailFrame({ html, title }: { html: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;margin:8px;word-wrap:break-word}
    p{margin:0 0 .75em} img{max-width:100%;height:auto} blockquote{border-left:3px solid #ddd;margin:0 0 .75em;padding-left:.75em;color:#555}
  </style></head><body>${html}</body></html>`;

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-same-origin allow-popups"
      srcDoc={doc}
      style={{ height }}
      className="w-full rounded-md border bg-white"
      onLoad={() => {
        const body = ref.current?.contentDocument?.body;
        if (body) setHeight(Math.min(Math.max(body.scrollHeight + 24, 80), 900));
      }}
    />
  );
}
