import { useTranslation } from "react-i18next";

interface ArtifactContextProps {
  entries: unknown[];
}

export function ArtifactContext({ entries }: ArtifactContextProps) {
  const { t } = useTranslation("components");

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-sm text-text-muted">{t("artifact.contextPlaceholder", { count: entries.length })}</p>
    </div>
  );
}
