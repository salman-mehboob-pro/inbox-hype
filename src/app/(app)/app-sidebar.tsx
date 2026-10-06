"use client";

import {
  ChevronsUpDownIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MailIcon,
  MegaphoneIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { logout } from "../(auth)/actions";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/campaigns", label: "Campaigns", icon: MegaphoneIcon },
  { href: "/leads", label: "Leads", icon: UsersIcon },
  { href: "/email-accounts", label: "Email accounts", icon: MailIcon },
  { href: "/inbox", label: "Unibox", icon: InboxIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppSidebar({
  email,
  workspaceName,
  unreadReplies,
}: {
  email: string;
  workspaceName: string;
  unreadReplies: number;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-8 items-center px-1.5 group-data-[collapsible=icon]:px-0">
          <Logo className="group-data-[collapsible=icon]:[&>span:last-child]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                    tooltip={item.label}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {item.href === "/inbox" && unreadReplies > 0 && (
                    <SidebarMenuBadge aria-label={`${unreadReplies} unread`}>
                      {unreadReplies > 99 ? "99+" : unreadReplies}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium uppercase">
                  {email.slice(0, 2)}
                </span>
                <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{workspaceName}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </span>
                <ChevronsUpDownIcon className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOutIcon />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
