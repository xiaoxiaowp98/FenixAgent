import type { LucideIcon } from "lucide-react";
import { BookOpen, Clock, Cpu, KeyRound, Menu, MessageSquare, Monitor, Plug, Radio, Settings, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NS } from "../../i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";

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
  onNavigate: (pageId: string) => void;
}

export function AgentSidebarConfig({ onNavigate }: AgentSidebarConfigProps) {
  const { t } = useTranslation(NS.AGENT_PANEL);

  return (
    <nav className="py-2 overflow-y-auto overflow-x-hidden">
      <div className="px-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-[var(--radius)] text-[13px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-all duration-150 cursor-pointer"
            >
              <Menu className="w-[18px] h-[18px] flex-shrink-0" />
              <span>{t("navigation")}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-48">
            {NAV_GROUPS.map((group, gi) => (
              <DropdownMenuGroup key={group.labelKey}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-dim">
                  {t(group.labelKey)}
                </DropdownMenuLabel>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.id} onClick={() => onNavigate(item.id)}>
                      <Icon className="w-4 h-4" />
                      <span>{t(item.labelKey)}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
