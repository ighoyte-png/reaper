import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  CalendarRange,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  Users,
} from "lucide-react";

export type NavLinkDef = {
  href: string;
  label: string;
  icon: LucideIcon;
  manageOnly: boolean;
  /** Shown only when the effective viewer is a member (not manager/admin). */
  memberOnly?: boolean;
  /** Hidden for contractor members (non-managers). */
  contractorMemberHidden?: boolean;
};

export const primaryNavLinks: NavLinkDef[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, manageOnly: false },
  { href: "/schedule", label: "Schedule", icon: CalendarRange, manageOnly: false, contractorMemberHidden: true },
  { href: "/projects", label: "Projects", icon: FolderKanban, manageOnly: false },
  {
    href: "/reports/tasks",
    label: "My Tasks",
    icon: CheckSquare,
    manageOnly: false,
    memberOnly: true,
  },
  { href: "/reports", label: "Reports", icon: BarChart3, manageOnly: true },
  { href: "/clients", label: "Clients", icon: Building2, manageOnly: true },
  { href: "/people", label: "People", icon: Users, manageOnly: true },
];

export const shareNavLinks = primaryNavLinks.filter((l) => !l.memberOnly);
