import type { FieldSchema } from "@/workflow/types";
import { Section } from "@/components/forms/Section";
import { FieldRenderer } from "@/components/forms/FieldRenderer";

/**
 * Layout-only field that nests sub-fields inside a smaller collapsible
 * panel. Useful for grouping things like "Response Format" and
 * "Output Variables" inside an "Advanced" section without adding another
 * top-level form section.
 */
export function AccordionField({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const inner = field.fields ?? [];
  const defaultCollapsed =
    (field.meta?.defaultCollapsed as boolean | undefined) ?? false;

  return (
    <Section title={field.label} variant="nested" defaultCollapsed={defaultCollapsed}>
      <div className="flex flex-col gap-3">
        {inner.map((sub) => (
          <FieldRenderer key={sub.key || sub.label} nodeId={nodeId} field={sub} />
        ))}
      </div>
    </Section>
  );
}
