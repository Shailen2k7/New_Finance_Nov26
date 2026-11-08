"use client";
import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { BottomNav } from "./bottom-nav";

export function Shell({ children, businessName, userName, aiReady }: { children: React.ReactNode; businessName: string; userName: string; aiReady: boolean }) {
  const [menu, setMenu] = useState(false);
  const [cmd, setCmd] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmd((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="flex h-dvh overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <Sidebar businessName={businessName} open={menu} onClose={() => setMenu(false)} aiReady={aiReady} />
      <div className="flex min-w-0 flex-1 flex-col lg:py-3 lg:pr-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface lg:rounded-2xl lg:border lg:border-line">
          <Topbar onMenu={() => setMenu(true)} onCommand={() => setCmd(true)} userName={userName} />
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface-2 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-5 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:p-7">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
      <BottomNav onMore={() => setMenu(true)} />
      <CommandPalette open={cmd} onClose={() => setCmd(false)} />
    </div>
  );
}
