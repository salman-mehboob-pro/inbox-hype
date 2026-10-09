"use client";

import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon, MoreHorizontalIcon, UserMinusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLoginLink, inviteMember, removeMember } from "./members-actions";

export type Member = { userId: string; email: string; isAdmin: boolean; signedIn: boolean };

// Admin only: who can open this workspace, add a client, login links, remove.
export function MembersCard({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<{ email: string; url: string; welcome: boolean } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  function invite() {
    const target = email.trim().toLowerCase();
    startTransition(async () => {
      const res = await inviteMember(target);
      if (!res.ok) {
        toast.error(res.error ?? "Could not add this person.");
        return;
      }
      setEmail("");
      router.refresh();
      if (res.link) setLink({ email: target, url: res.link, welcome: true });
      else if (res.alreadyMember) toast.info(`${target} already has access.`);
      else toast.success(`${target} added. They log in with their own password.`);
    });
  }

  function newLink(member: Member) {
    startTransition(async () => {
      const res = await createLoginLink(member.userId);
      if (!res.ok || !res.link) {
        toast.error(res.error ?? "Could not make a link.");
        return;
      }
      setLink({ email: member.email, url: res.link, welcome: !member.signedIn });
    });
  }

  function remove() {
    if (!removing) return;
    const member = removing;
    startTransition(async () => {
      const res = await removeMember(member.userId);
      setRemoving(null);
      if (!res.ok) {
        toast.error(res.error ?? "Could not remove access.");
        return;
      }
      toast.success(`${member.email} no longer has access to this workspace.`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>People with access</CardTitle>
        <CardDescription>
          A client you add here sees only this workspace (and other workspaces you add them to). Admins see every
          workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            invite();
          }}
        >
          <div className="grid flex-1 gap-2">
            <Label htmlFor="invite-email">Add a client by email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@brand.com"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={pending || email.trim() === ""}>
            {pending && <Loader2Icon className="animate-spin" />}
            Add client
          </Button>
        </form>

        <ul className="divide-y rounded-lg border">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{m.email}</span>
              {!m.signedIn && <Badge variant="outline">Invite pending</Badge>}
              <Badge variant={m.isAdmin ? "default" : "secondary"}>{m.isAdmin ? "Admin" : "Client"}</Badge>
              {m.userId === currentUserId || m.isAdmin ? (
                <span className="size-7" />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.email}`} disabled={pending} />
                    }
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    <DropdownMenuItem onClick={() => newLink(m)}>
                      <KeyRoundIcon />
                      {m.signedIn ? "Password reset link" : "New invite link"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setRemoving(m)}>
                      <UserMinusIcon />
                      Remove access
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      </CardContent>

      <LinkDialog link={link} onClose={() => setLink(null)} />

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.email}?</DialogTitle>
            <DialogDescription>
              They can no longer open this workspace. Their account and this workspace&apos;s data stay as they are.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              Remove access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function LinkDialog({
  link,
  onClose,
}: {
  link: { email: string; url: string; welcome: boolean } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <Dialog
      open={link !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{link?.welcome ? "Send this invite link" : "Send this password link"}</DialogTitle>
          <DialogDescription>
            Send it to {link?.email} yourself (email, WhatsApp…). It logs them in once so they can{" "}
            {link?.welcome ? "choose a password" : "set a new password"}. It works one time and expires after a short
            while; you can make a new one from the ⋯ menu. Don&apos;t share it with anyone else.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={link?.url ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label="Login link" />
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
