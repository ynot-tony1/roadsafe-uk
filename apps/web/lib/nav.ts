export interface NavItem {
  href: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/map", label: "Map" },
  { href: "/local-authorities", label: "Local authorities" },
  { href: "/road-users", label: "Road users" },
  { href: "/hotspots", label: "Hotspots" },
  { href: "/about/data", label: "About the data" },
  { href: "/status", label: "Status" },
];
