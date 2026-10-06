"use client";

import { FileTextIcon, Loader2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { updateLeadNotes } from "../actions";

export function NotesCard({ id, initial }: { id: string; initial: string }) {
  const [saved, setSaved] = useState(initial);
  const [notes, setNotes] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileTextIcon className="size-4 text-primary" />
          Notes
        </CardTitle>
        <CardDescription>Notes about this lead. Later used by AI when drafting replies.</CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          aria-label="Notes"
          rows={5}
          maxLength={10000}
          placeholder="Add notes about this lead…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          disabled={pending || notes === saved}
          onClick={() =>
            startTransition(async () => {
              const res = await updateLeadNotes(id, notes);
              if (res.ok) {
                setSaved(notes);
                toast.success("Notes saved");
              } else toast.error(res.error);
            })
          }
        >
          {pending && <Loader2Icon className="animate-spin" />}
          Save notes
        </Button>
      </CardFooter>
    </Card>
  );
}
