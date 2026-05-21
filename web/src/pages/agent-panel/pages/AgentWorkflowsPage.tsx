import { useTranslation } from "react-i18next";
import { WorkflowPage } from "../../WorkflowPage";
import { AgentPageHeader } from "../shared/AgentPageHeader";

export function AgentWorkflowsPage() {
  const { t } = useTranslation("workflows");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <AgentPageHeader title={t("title")} subtitle={t("subtitle")} />
      <div className="flex-1 min-h-0">
        <WorkflowPage />
      </div>
    </div>
  );
}
