import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

export interface FormDialogFormConfig {
  schema: z.ZodType<Record<string, unknown>>;
  defaultValues: Record<string, unknown>;
  onFormSubmit: (data: Record<string, unknown>) => void;
}

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  loading?: boolean;
  width?: string;
  formConfig?: FormDialogFormConfig;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  children,
  onSubmit,
  submitLabel = "保存",
  loading,
  width = "sm:max-w-lg",
  formConfig,
}: FormDialogProps) {
  const methods = useForm<Record<string, unknown>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: formConfig?.schema ? zodResolver(formConfig.schema as any) : undefined,
    defaultValues: formConfig?.defaultValues,
  });

  const handleFormSubmit = formConfig
    ? methods.handleSubmit(formConfig.onFormSubmit)
    : (e: React.FormEvent) => { e.preventDefault(); onSubmit(); };

  const formContent = (
    <>
      {children}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "保存中..." : submitLabel}
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={width}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formConfig ? (
          <FormProvider {...methods}>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              {formContent}
            </form>
          </FormProvider>
        ) : (
          <form onSubmit={handleFormSubmit as React.FormEventHandler} className="space-y-4">
            {formContent}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
