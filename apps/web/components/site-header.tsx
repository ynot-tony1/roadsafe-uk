"use client";

import { Menu, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SiteNavLink } from "@/components/site-nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { NAV_ITEMS } from "@/lib/nav";

export function SiteHeader() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="size-5" aria-hidden="true" />
          <span>RoadSafe UK</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <SiteNavLink key={item.href} item={item} />
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle />

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-4 px-4" aria-label="Primary">
                {NAV_ITEMS.map((item) => (
                  <SiteNavLink
                    key={item.href}
                    item={item}
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
