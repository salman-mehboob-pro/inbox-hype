"use client";

import { Loader2Icon, PlusIcon, TagIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LIMITS, parseTags } from "@/lib/leads/import";
import { changeLeadTags } from "../actions";

export function TagsCard({ id, tags, suggestions }: { id: string; tags: string[]; suggestions: string[] }) {
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();

  function change(list: string[], mode: "add" | "remove") {
    if (!list.length) return;
    startTransition(async () => {
      const res = await changeLeadTags([id], list, mode);
      if (res.ok) {
        if (mode === "add") setInput("");
      } else toast.error(res.error);
    });
  }

  const full = tags.length >= LIMITS.maxTagsPerLead;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TagIcon className="size-4 text-primary" />
          Tags
          {pending && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 pr-1">
                {t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  disabled={pending}
                  onClick={() => change([t], "remove")}
                  className="rounded-sm p-0.5 hover:bg-foreground/10"
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            change(parseTags(input), "add");
          }}
        >
          <Input
            aria-label="Add a tag"
            placeholder={full ? `Max ${LIMITS.maxTagsPerLead} tags` : "Add a tag…"}
            disabled={full}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <Button type="submit" variant="outline" size="icon" aria-label="Add tag" disabled={pending || full || !input.trim()}>
            <PlusIcon />
          </Button>
        </form>

        {suggestions.length > 0 && !full && (
          <div className="grid gap-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">Quick add:</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.slice(0, 12).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={pending}
                  onClick={() => change([t], "add")}
                  className="rounded-md bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
