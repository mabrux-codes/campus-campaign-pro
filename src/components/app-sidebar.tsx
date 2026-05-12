import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Megaphone, FileBarChart, User, LineChart, LogOut, Users, Sparkles, Bell, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { BrandLockup, BrandMark } from "@/components/brand";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone },
  { title: "Influencers", url: "/influencers", icon: Sparkles },
  { title: "Reports", url: "/reports", icon: FileBarChart },
  { title: "Analytics", url: "/analytics", icon: LineChart },
  { title: "Team", url: "/team", icon: Users },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Profile", url: "/profile", icon: User },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { signOut } = useAuth();
  const { unreadCount } = useNotifications();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="space-y-3 px-3 py-4">
        {collapsed ? <BrandMark size={28} /> : <BrandLockup />}
        {!collapsed && <WorkspaceSwitcher />}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => {
                const active = path === it.url || path.startsWith(it.url + "/");
                const showBadge = it.url === "/notifications" && unreadCount > 0;
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={it.url} className="flex items-center gap-2">
                        <it.icon className="h-4 w-4" />
                        {!collapsed && <span className="flex-1">{it.title}</span>}
                        {showBadge && (
                          <span className={`inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground ${collapsed ? "absolute right-1 top-1 h-4 min-w-4" : "h-5 min-w-5"}`}>
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
