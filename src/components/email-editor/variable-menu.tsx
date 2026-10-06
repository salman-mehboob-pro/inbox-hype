"use client";

import { BracesIcon, ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STANDARD_VARIABLES } from "@/lib/email/template";

// "Insert variable" menu: lead fields, sender, and the workspace's custom fields.
export function VariableMenu({
  customKeys,
  onPick,
  label = "Variable",
}: {
  customKeys: string[];
  onPick: (name: string) => void;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <BracesIcon />
        {label}
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 min-w-56 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Lead &amp; sender</DropdownMenuLabel>
          {STANDARD_VARIABLES.map((v) => (
            <DropdownMenuItem key={v.name} onClick={() => onPick(v.name)}>
              {v.label}
              <span className="ml-auto font-mono text-xs text-muted-foreground">{v.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {customKeys.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Custom fields</DropdownMenuLabel>
              {customKeys.map((k) => (
                <DropdownMenuItem key={k} onClick={() => onPick(k)}>
                  <span className="font-mono text-xs">{k}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
