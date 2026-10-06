"use client";

import Image from "@tiptap/extension-image";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  BoldIcon,
  ChevronDownIcon,
  CodeXmlIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  RemoveFormattingIcon,
  SparklesIcon,
  StrikethroughIcon,
  TypeIcon,
  UnderlineIcon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { VariableMenu } from "./variable-menu";

export type BodyFormat = "rich" | "html";

const MAX_IMPORT_BYTES = 500 * 1024;

const FONT_SIZES = [
  { label: "Small", value: "13px" },
  { label: "Normal", value: null },
  { label: "Large", value: "18px" },
  { label: "Huge", value: "24px" },
];

const COLORS = ["#111827", "#6b7280", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed"];

// Links may be normal URLs, mailto:, or a variable like {{website}}.
const isAllowedLink = (url: string) => /^\{\{[^{}]+\}\}$/.test(url.trim()) || /^(https?:|mailto:)/i.test(url.trim());

export function isEmptyBody(html: string): boolean {
  return !html.replace(/<(?!img)[^>]*>/gi, "").replace(/&nbsp;/g, " ").trim() && !/<img/i.test(html);
}

export function EmailEditor({
  id,
  value,
  format,
  onChange,
  customKeys,
  placeholder,
}: {
  id: string;
  value: string;
  format: BodyFormat;
  onChange: (value: string, format: BodyFormat) => void;
  customKeys: string[];
  placeholder?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const [dialog, setDialog] = useState<"link" | "image" | null>(null);
  // The editor is created once; always call the latest onChange.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          isAllowedUri: (url, ctx) => isAllowedLink(url) || ctx.defaultValidate(url),
        },
      }),
      TextStyle,
      Color,
      FontSize,
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Write your email…" }),
    ],
    content: format === "rich" ? value : "",
    editorProps: {
      attributes: {
        id,
        class: "email-content min-h-48 px-3 py-2 text-sm outline-none",
        "aria-label": "Email body",
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.isEmpty ? "" : editor.getHTML(), "rich"),
  });

  // Switching modes (or loading another step) puts the HTML into the editor.
  useEffect(() => {
    if (!editor || format !== "rich") return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (current !== value) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, format, value]);

  function switchTo(next: BodyFormat) {
    if (next === format) return;
    if (next === "html") {
      onChange(editor && !editor.isEmpty ? editor.getHTML() : value, "html");
    } else {
      // The editor only keeps what it understands (text, links, lists, …).
      editor?.commands.setContent(value, { emitUpdate: false });
      onChange(editor && !editor.isEmpty ? editor.getHTML() : "", "rich");
    }
  }

  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    if (format === "rich") {
      editor?.chain().focus().insertContent(token).run();
      return;
    }
    const el = htmlRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end), "html");
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function importHtml(file: File | undefined) {
    if (!file) return;
    if (!/\.html?$/i.test(file.name)) return toast.error("Choose an .html file.");
    if (file.size > MAX_IMPORT_BYTES) return toast.error("The file is larger than 500 KB.");
    onChange(await file.text(), "html");
    toast.success(`${file.name} imported`);
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>Email body</Label>
        <div className="flex flex-wrap items-center gap-2">
          <VariableMenu customKeys={customKeys} onPick={insertVariable} label="Variables" />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <UploadIcon />
            Import .html
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".html,.htm,text/html"
            className="sr-only"
            aria-label="Import HTML file"
            onChange={(e) => {
              importHtml(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div role="radiogroup" aria-label="Editor mode" className="flex rounded-lg bg-muted p-0.5">
            <ModeButton active={format === "rich"} onClick={() => switchTo("rich")} icon={TypeIcon}>
              Text
            </ModeButton>
            <ModeButton active={format === "html"} onClick={() => switchTo("html")} icon={CodeXmlIcon}>
              HTML paste
            </ModeButton>
            <ModeButton active={false} disabled title="Coming later (needs the AI step)" icon={SparklesIcon}>
              HTML with AI
            </ModeButton>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        {format === "rich" ? (
          <>
            {editor && <Toolbar editor={editor} onLink={() => setDialog("link")} onImage={() => setDialog("image")} />}
            <EditorContent editor={editor} />
          </>
        ) : (
          <Textarea
            ref={htmlRef}
            id={id}
            aria-label="Email HTML"
            rows={14}
            spellCheck={false}
            className="rounded-none border-0 font-mono text-xs focus-visible:ring-0"
            placeholder="<p>Paste your HTML here. Variables like {{firstName}} work too.</p>"
            value={value}
            onChange={(e) => onChange(e.target.value, "html")}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Switching modes converts the content right away; switching back won&apos;t restore it exactly.
      </p>

      {editor && (
        <>
          <LinkDialog editor={editor} open={dialog === "link"} onClose={() => setDialog(null)} />
          <ImageDialog editor={editor} open={dialog === "image"} onClose={() => setDialog(null)} />
        </>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  disabled,
  title,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors",
        active && "bg-background text-foreground shadow-sm",
        !active && !disabled && "hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

function Toolbar({ editor, onLink, onImage }: { editor: Editor; onLink: () => void; onImage: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      link: e.isActive("link"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      color: (e.getAttributes("textStyle").color as string | undefined) ?? null,
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1" role="toolbar" aria-label="Formatting">
      <ToolButton label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()} icon={BoldIcon} />
      <ToolButton label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()} icon={ItalicIcon} />
      <ToolButton
        label="Underline"
        active={state.underline}
        onClick={() => chain().toggleUnderline().run()}
        icon={UnderlineIcon}
      />
      <ToolButton
        label="Strikethrough"
        active={state.strike}
        onClick={() => chain().toggleStrike().run()}
        icon={StrikethroughIcon}
      />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<button type="button" aria-label="Text size" className={toolClass(false, "w-auto gap-0.5 px-1.5")} />}
        >
          <TypeIcon className="size-4" />
          <ChevronDownIcon className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {FONT_SIZES.map((s) => (
            <DropdownMenuItem
              key={s.label}
              onClick={() => (s.value ? chain().setFontSize(s.value).run() : chain().unsetFontSize().run())}
            >
              <span style={s.value ? { fontSize: s.value } : undefined}>{s.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" aria-label="Text color" className={toolClass(false)} />}>
          <span className="flex flex-col items-center leading-none">
            <span className="text-sm font-semibold">A</span>
            <span className="h-0.5 w-4 rounded" style={{ background: state.color ?? "currentColor" }} />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-0 p-2">
          <div className="grid grid-cols-4 gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                className="size-6 rounded-md ring-1 ring-foreground/10 hover:scale-110"
                style={{ background: c }}
                onClick={() => chain().setColor(c).run()}
              />
            ))}
          </div>
          <DropdownMenuItem className="mt-1" onClick={() => chain().unsetColor().run()}>
            Default color
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Divider />
      <ToolButton label="Link" active={state.link} onClick={onLink} icon={LinkIcon} />
      <ToolButton label="Image" active={false} onClick={onImage} icon={ImageIcon} />
      <Divider />
      <ToolButton
        label="Bullet list"
        active={state.bulletList}
        onClick={() => chain().toggleBulletList().run()}
        icon={ListIcon}
      />
      <ToolButton
        label="Numbered list"
        active={state.orderedList}
        onClick={() => chain().toggleOrderedList().run()}
        icon={ListOrderedIcon}
      />
      <ToolButton
        label="Quote"
        active={state.blockquote}
        onClick={() => chain().toggleBlockquote().run()}
        icon={QuoteIcon}
      />
      <Divider />
      <ToolButton
        label="Clear formatting"
        active={false}
        onClick={() => chain().unsetAllMarks().clearNodes().run()}
        icon={RemoveFormattingIcon}
      />
    </div>
  );
}

const toolClass = (active: boolean, extra = "") =>
  cn(
    "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    active && "bg-muted text-foreground",
    extra,
  );

function ToolButton({
  label,
  active,
  onClick,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={toolClass(active)}
    >
      <Icon className="size-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}

// The dialog body only mounts while open, so its fields start fresh each time.
function LinkDialog({ editor, open, onClose }: { editor: Editor; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link</DialogTitle>
          <DialogDescription>Select text first to turn it into a link. Variables like {"{{website}}"} work.</DialogDescription>
        </DialogHeader>
        <LinkForm editor={editor} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const formId = useId();
  const [url, setUrl] = useState(() => (editor.getAttributes("link").href as string | undefined) ?? "");
  const [error, setError] = useState<string>();

  function apply(e: React.FormEvent) {
    e.preventDefault();
    let href = url.trim();
    if (href && !/^(https?:|mailto:|\{\{)/i.test(href)) href = `https://${href}`;
    if (href && !isAllowedLink(href)) return setError("Use a link like https://example.com or {{website}}.");
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!href) chain.unsetLink().run();
    else if (editor.state.selection.empty && !editor.isActive("link")) {
      // Nothing selected: insert the link text itself.
      chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else chain.setLink({ href }).run();
    onClose();
  }

  return (
    <>
      <form id={formId} onSubmit={apply} className="grid gap-1.5">
        <Label htmlFor={`${formId}-url`}>URL</Label>
        <Input
          id={`${formId}-url`}
          autoFocus
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
      <DialogFooter>
        {editor.isActive("link") && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              onClose();
            }}
          >
            Remove link
          </Button>
        )}
        <Button type="submit" form={formId}>
          Save link
        </Button>
      </DialogFooter>
    </>
  );
}

function ImageDialog({ editor, open, onClose }: { editor: Editor; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Image</DialogTitle>
          <DialogDescription>
            Paste a public image link. Tip: images in cold emails can hurt inbox placement, so use them sparingly.
          </DialogDescription>
        </DialogHeader>
        <ImageForm editor={editor} onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function ImageForm({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const formId = useId();
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string>();

  function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!/^https:\/\/\S+$/i.test(src.trim())) return setError("Use a public https:// image link.");
    editor.chain().focus().setImage({ src: src.trim(), alt: alt.trim() || undefined }).run();
    onClose();
  }

  return (
    <>
      <form id={formId} onSubmit={apply} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-src`}>Image URL</Label>
          <Input
            id={`${formId}-src`}
            autoFocus
            placeholder="https://…/logo.png"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-alt`}>Description (alt text)</Label>
          <Input id={`${formId}-alt`} placeholder="Company logo" value={alt} onChange={(e) => setAlt(e.target.value)} />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" form={formId}>
          Insert image
        </Button>
      </DialogFooter>
    </>
  );
}
