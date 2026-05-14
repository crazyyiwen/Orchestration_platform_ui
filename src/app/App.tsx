import { useEffect } from "react";

import { Header } from "@/components/layout/Header";
import { NodePalette } from "@/components/layout/NodePalette";
import { PropertiesPanel } from "@/components/layout/PropertiesPanel";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { RunPanel } from "@/components/run/RunPanel";
import { SaveToast } from "@/components/ui/SaveToast";
import { VariablesPanel } from "@/components/variables/VariablesPanel";
import { WorkflowsListModal } from "@/components/workflows/WorkflowsListModal";
import { useWorkflowStore } from "@/store/workflowStore";

/**
 * Three-column shell: Header + (Palette | Canvas | PropertiesPanel).
 * The properties panel only renders when a node is selected — when collapsed
 * the canvas reclaims its space. The RunPanel is a portal-rendered modal,
 * mounted once here and toggled via the workflow store.
 *
 * `bootstrap()` fires once on mount to pull the workflow index from the
 * backend and load the most-recent workflow into the editor.
 */
export function App() {
  const bootstrap = useWorkflowStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <div className="flex h-screen w-screen flex-col bg-canvas">
      <Header />
      <div className="flex min-h-0 flex-1">
        <NodePalette />
        <main className="relative flex min-w-0 flex-1">
          <WorkflowCanvas />
        </main>
        <PropertiesPanel />
      </div>
      <VariablesPanel />
      <WorkflowsListModal />
      <RunPanel />
      <SaveToast />
    </div>
  );
}
