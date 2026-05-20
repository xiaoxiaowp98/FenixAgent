import { useTranslation } from "react-i18next";

interface ArtifactPreviewProps {
  entries: unknown[];
}

export function ArtifactPreview({ entries }: ArtifactPreviewProps) {
  const { t } = useTranslation("components");

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-sm text-text-muted">{t("artifact.previewPlaceholder", { count: entries.length })}</p>
    </div>
  );
}
