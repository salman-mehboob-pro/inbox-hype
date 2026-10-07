"use client";

import { CheckIcon, ChevronsUpDownIcon, LogOutIcon, PlusIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { logout } from "../(auth)/actions";
import { createWorkspace, switchWorkspace } from "./workspaces/actions";

export type WorkspaceOption = { id: string; name: string; isActive: boolean };

// Bottom of the sidebar: the open workspace + the user's email in one button.
// The menu: switch workspace, "New workspace", log out.
export function WorkspaceSwitcher({ workspaces, email }: { workspaces: WorkspaceOption[]; email: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const active = workspaces.find((w) => w.isActive);

  // A detail page (one campaign, one lead...) belongs to the old workspace,
  // so go to the list of the same section.
  function goToSection() {
    const section = pathname.split("/")[1];
    router.push(section ? `/${section}` : "/dashboard");
    router.refresh();
  }

  function open(id: string) {
    if (id === active?.id) return;
    startTransition(async () => {
      const res = await switchWorkspace(id);
      if (!res.ok) {
        toast.error(res.error ?? "Could not open that workspace.");
        return;
      }
      goToSection();
    });
  }

  function create() {
    startTransition(async () => {
      const res = await createWorkspace(name);
      if (!res.ok) {
        toast.error(res.error ?? "Could not create the workspace.");
        return;
      }
      toast.success(`Workspace "${name.trim()}" created`);
      setCreating(false);
      setName("");
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<SidebarMenuButton size="lg" disabled={pending} />}
          aria-label="Workspace and account"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold uppercase text-primary-foreground">
            {active?.name.slice(0, 1) ?? "?"}
          </span>
          <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{active?.name ?? "Workspace"}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
          </span>
          <ChevronsUpDownIcon className="ml-auto size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => open(w.id)}>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                {w.isActive && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreating(true)}>
            <PlusIcon />
            New workspace
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => logout()}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              A separate space with its own inboxes, leads, campaigns and Unibox. Nothing is shared between workspaces.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="workspace-name">Name</Label>
              <Input
                id="workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Client A"
                maxLength={100}
                autoFocus
              />
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit" disabled={pending || name.trim() === ""}>
                {pending ? "Creating..." : "Create workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
