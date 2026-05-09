import { Header } from "@/components/layout/Header";
import { NodePalette } from "@/components/layout/NodePalette";
import { PropertiesPanel } from "@/components/layout/PropertiesPanel";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { RunPanel } from "@/components/run/RunPanel";

/**
 * Three-column shell: Header + (Palette | Canvas | PropertiesPanel).
 * The properties panel only renders when a node is selected — when collapsed
 * the canvas reclaims its space. The RunPanel is a portal-rendered modal,
 * mounted once here and toggled via the workflow store.
 */
export function App() {
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
      <RunPanel />
    </div>
  );
}
