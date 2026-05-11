import { useState, useRef, useEffect } from "react";
import { Search, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useSession, signOut } from "../../lib/auth-client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TopbarProps {
  currentPage: string;
}

/* ------------------------------------------------------------------ */
/*  Page ID -> breadcrumb label mapping                                */
/* ------------------------------------------------------------------ */

const PAGE_LABELS: Record<string, string> = {
  dashboard: "概览",
  environments: "智能体",
  session: "会话",
  models: "模型",
  agents: "Agent",
  skills: "技能",
  mcp: "MCP",
  tasks: "定时任务",
  channels: "消息渠道",
  apikeys: "API Key",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Topbar({ currentPage }: TopbarProps) {
  const { data: session } = useSession();
  const userEmail = session?.user?.email ?? "";
  const avatarLetter = userEmail.charAt(0).toUpperCase() || "U";
  const pageLabel = PAGE_LABELS[currentPage] ?? currentPage;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    await signOut({ fetchOptions: { credentials: "include" } });
  };

  return (
    <header
      className={[
        "flex items-center gap-4",
        "h-[var(--topbar-height)] min-h-[var(--topbar-height)]",
        "border-b border-border-subtle bg-surface-1",
        "px-6 flex-shrink-0",
      ].join(" ")}
    >
      {/* ---- Left: Breadcrumb ---- */}
      <div className="flex items-center gap-1.5 text-[13px]">
        <span className="text-text-dim">Dashboard</span>
        <span className="text-text-dim opacity-50">/</span>
        <span className="font-semibold text-text-bright font-[var(--font-display)]">
          {pageLabel}
        </span>
      </div>

      {/* ---- Spacer ---- */}
      <div className="flex-1" />

      {/* ---- Right: Search + Theme + Avatar ---- */}
      <div className="flex items-center gap-3">
        {/* Search box (visual placeholder — not yet functional) */}
        <button
          type="button"
          title="全局搜索功能开发中"
          className={[
            "flex items-center gap-2",
            "min-w-[200px] px-3 py-1.5",
            "rounded-[var(--radius)]",
            "border border-border-subtle bg-surface-elevated",
            "text-text-dim text-[13px]",
            "cursor-default opacity-60",
          ].join(" ")}
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" />
          <span>搜索...</span>
          <kbd
            className={[
              "ml-auto px-1.5 py-0.5 rounded-[4px]",
              "border border-border-default",
              "text-[11px] font-[var(--font-mono)] text-text-dim",
            ].join(" ")}
          >
            ⌘K
          </kbd>
        </button>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User avatar + dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className={[
              "w-8 h-8 rounded-full flex-shrink-0",
              "flex items-center justify-center",
              "bg-gradient-to-br from-brand to-brand-light",
              "text-white text-[13px] font-semibold",
              "cursor-pointer transition-shadow duration-150",
              "hover:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]",
            ].join(" ")}
            title={userEmail}
          >
            {avatarLetter}
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              className={[
                "absolute right-0 top-full mt-2",
                "w-52 py-1.5",
                "rounded-[var(--radius-lg)]",
                "border border-border-default bg-surface-2",
                "shadow-lg shadow-black/10",
                "z-50",
              ].join(" ")}
            >
              {/* User info */}
              <div className="px-3 py-2 border-b border-border-subtle">
                <p className="text-[13px] font-medium text-text-bright truncate">
                  {userEmail}
                </p>
              </div>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                className={[
                  "flex items-center gap-2 w-full px-3 py-2",
                  "text-[13px] text-text-default",
                  "hover:bg-surface-elevated rounded-[var(--radius)] mx-1",
                  "transition-colors duration-100",
                ].join(" ")}
              >
                <LogOut className="w-3.5 h-3.5" />
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
