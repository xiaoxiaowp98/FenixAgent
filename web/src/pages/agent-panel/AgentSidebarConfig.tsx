import type { LucideIcon } from "lucide-react";
import { BookOpen, Clock, Cpu, KeyRound, MessageSquare, Monitor, Plug, Radio, Settings, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NS } from "../../i18n";

interface NavEntry {
  id: string;
  labelKey: string;
  icon: LucideIcon;
}

interface NavGroup {
  labelKey: string;
  items: NavEntry[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "agentPanel:console",
    items: [
      { id: "dashboard", labelKey: "agentPanel:overview", icon: Monitor },
      { id: "workflow", labelKey: "agentPanel:workflow", icon: Workflow },
      { id: "models", labelKey: "agentPanel:models", icon: Cpu },
      { id: "session", labelKey: "agentPanel:sessions", icon: MessageSquare },
    ],
  },
  {
    labelKey: "agentPanel:config",
    items: [
      { id: "skills", labelKey: "agentPanel:skills", icon: Settings },
      { id: "knowledge-bases", labelKey: "agentPanel:knowledgeBases", icon: BookOpen },
      { id: "mcp", labelKey: "agentPanel:mcp", icon: Plug },
      { id: "tasks", labelKey: "agentPanel:tasks", icon: Clock },
      { id: "channels", labelKey: "agentPanel:channels", icon: Radio },
      { id: "apikeys", labelKey: "agentPanel:apiKeys", icon: KeyRound },
    ],
  },
];

interface AgentSidebarConfigProps {
  collapsed: boolean;
  onNavigate: (pageId: string) => void;
}

export function AgentSidebarConfig({ collapsed, onNavigate }: AgentSidebarConfigProps) {
  const { t } = useTranslation(NS.AGENT_PANEL);

  return (
    <nav className="py-2 overflow-y-auto overflow-x-hidden">
      {NAV_GROUPS.map((group) => (
        <div key={group.labelKey}>
          <div
            className={[
              "text-[11px] font-semibold uppercase tracking-[0.06em]",
              "text-text-dim whitespace-nowrap overflow-hidden",
              "px-5 pt-3 pb-1.5",
              "transition-all duration-200",
              collapsed && "text-center px-2 text-[0px] pt-3 pb-1.5",
            ].join(" ")}
          >
            {collapsed ? <span className="block w-4 h-px bg-border-default mx-auto mt-1" /> : t(group.labelKey)}
          </div>

          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                title={collapsed ? t(item.labelKey) : undefined}
                className={[
                  "relative flex items-center w-full",
                  "text-[13px] font-medium cursor-pointer",
                  "transition-all duration-150",
                  "whitespace-nowrap overflow-hidden select-none",
                  "text-text-secondary",
                  collapsed
                    ? "justify-center gap-0 px-0 py-2 mx-1.5 rounded-lg"
                    : "gap-2.5 px-3 py-2 mx-2 rounded-[var(--radius)]",
                  "hover:bg-surface-hover hover:text-text-primary",
                ].join(" ")}
              >
                <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span
                  className={[
                    "overflow-hidden transition-opacity duration-200",
                    collapsed ? "opacity-0 w-0" : "opacity-100",
                  ].join(" ")}
                >
                  {t(item.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
