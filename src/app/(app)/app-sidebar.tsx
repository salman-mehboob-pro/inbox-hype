"use client";

import {
  FileTextIcon,
  InboxIcon,
  LayoutDashboardIcon,
  MailIcon,
  MegaphoneIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
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
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/campaigns", label: "Campaigns", icon: MegaphoneIcon },
  { href: "/templates", label: "Templates", icon: FileTextIcon },
  { href: "/leads", label: "Leads", icon: UsersIcon },
  { href: "/email-accounts", label: "Email accounts", icon: MailIcon },
  { href: "/inbox", label: "Unibox", icon: InboxIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppSidebar({
  email,
  workspaces,
  unreadReplies,
}: {
  email: string;
  workspaces: WorkspaceOption[];
  unreadReplies: number;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-8 items-center overflow-hidden px-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
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
            <WorkspaceSwitcher workspaces={workspaces} email={email} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
