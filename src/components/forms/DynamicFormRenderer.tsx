import type { FormSection } from "@/workflow/types";
import { Section } from "./Section";
import { FieldRenderer } from "./FieldRenderer";

/**
 * Walks the schema for the selected node and renders each section + field.
 *
 * The right-side properties panel is just `<DynamicFormRenderer />` plus a
 * header. Adding/removing fields for a node type happens in
 * `nodeRegistry.ts`; no UI code change is required.
 */
export function DynamicFormRenderer({
  nodeId,
  sections,
}: {
  nodeId: string;
  sections: FormSection[];
}) {
  return (
    <>
      {sections.map((section) => (
        <Section
          key={section.id}
          title={section.title}
          defaultCollapsed={!!section.defaultCollapsed}
        >
          <div className="flex flex-col gap-3">
            {section.fields.length === 0 && (
              <p className="text-[11px] italic text-ink-500">
                No fields configured for this section.
              </p>
            )}
            {section.fields.map((field) => (
              <FieldRenderer
                key={field.key || field.label}
                nodeId={nodeId}
                field={field}
              />
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}
