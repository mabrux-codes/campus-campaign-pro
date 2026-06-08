import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Megaphone, FileBarChart, User, LineChart, LogOut, Users, Sparkles, Bell, Settings, ListChecks } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { BrandMark } from "@/components/brand";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";
import { usePendingReports } from "@/lib/pending-reports";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone },
  { title: "Influencers", url: "/influencers", icon: Sparkles },
  { title: "Deliverables", url: "/deliverables", icon: ListChecks },
  { title: "Reports", url: "/reports", icon: FileBarChart },
  { title: "Analytics", url: "/analytics", icon: LineChart },
  { title: "Team", url: "/team", icon: Users },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Profile", url: "/profile", icon: User },
  { title: "Settings", url: "/settings", icon: Settings },
];

function OrgLockup({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile-brand", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("company_name,company_logo_url").eq("id", user!.id).single();
      return data;
    },
  });
  const name = profile?.company_name?.trim() || "Lumen";
  const logo = profile?.company_logo_url;

  const logoEl = logo ? (
    <img src={logo} alt={name} className="h-7 w-7 rounded-md object-contain bg-card" />
  ) : (
    <BrandMark size={28} />
  );

  if (collapsed) return logoEl;
  return (
    <div className="flex items-center gap-2">
      {logoEl}
      <span className="font-display truncate text-xl leading-none">{name}</span>
    </div>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const { data: pendingReports = [] } = usePendingReports();
  const pendingCount = pendingReports.length;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="space-y-3 px-3 py-4">
        <OrgLockup collapsed={collapsed} />
        {!collapsed && <WorkspaceSwitcher />}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => {
                const active = path === it.url || path.startsWith(it.url + "/");
                let badgeCount = 0;
                if (it.url === "/notifications") badgeCount = unreadCount;
                else if (it.url === "/reports") badgeCount = pendingCount;
                const showBadge = badgeCount > 0;
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={it.url} className="flex items-center gap-2">
                        <it.icon className="h-4 w-4" />
                        {!collapsed && <span className="flex-1">{it.title}</span>}
                        {showBadge && (
                          <span className={`inline-flex items-center justify-center rounded-full ${it.url === "/reports" ? "bg-warning text-warning-foreground" : "bg-primary text-primary-foreground"} px-1.5 text-[10px] font-semibold ${collapsed ? "absolute right-1 top-1 h-4 min-w-4" : "h-5 min-w-5"}`}>
                            {badgeCount > 99 ? "99+" : badgeCount}
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
