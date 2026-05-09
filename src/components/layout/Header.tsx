import { useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  Play,
  Save,
  Search,
  Settings2,
  Undo2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useWorkflowStore } from "@/store/workflowStore";

/**
 * Top header. Owns the workflow display name, the editing-state banner, and
 * the Save / Export / Import / Run controls. Save state is reflected in the
 * banner (amber when dirty, green for "Saved at HH:MM", red when validation
 * blocks a save).
 */
export function Header() {
  const docName = useWorkflowStore((s) => s.doc.name);
  const setDocName = useWorkflowStore((s) => s.setDocName);
  const nodeCount = useWorkflowStore((s) => s.doc.nodes.length);
  const lastSavedAt = useWorkflowStore((s) => s.lastSavedAt);
  const saveError = useWorkflowStore((s) => s.saveError);

  const save = useWorkflowStore((s) => s.save);
  const exportToFile = useWorkflowStore((s) => s.exportToFile);
  const importFromFile = useWorkflowStore((s) => s.importFromFile);
  const openRun = useWorkflowStore((s) => s.openRun);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSavedFlash, setShowSavedFlash] = useState(false);

  // Show a brief "Saved" flash after a successful save.
  useEffect(() => {
    if (lastSavedAt == null) return;
    setShowSavedFlash(true);
    const t = window.setTimeout(() => setShowSavedFlash(false), 2500);
    return () => window.clearTimeout(t);
  }, [lastSavedAt]);

  const handleSave = () => {
    const result = save();
    if (!result.ok) {
      // Validation issues are already in saveError; surface them as alert too.
      const summary = result.issues.map((i) => `• ${i.message}`).join("\n");
      window.alert(`Cannot save — workflow is invalid:\n${summary}`);
    }
  };

  const handleExport = () => {
    exportToFile();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow reselecting the same file later
    if (!file) return;
    const result = await importFromFile(file);
    if (!result.ok) {
      window.alert(`Import failed: ${result.error ?? "unknown error"}`);
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-100 bg-white px-4">
      <div className="flex flex-col leading-tight">
        <input
          value={docName}
          onChange={(e) => setDocName(e.target.value)}
          className="w-[280px] rounded bg-transparent text-sm font-semibold tracking-tight text-ink-900 outline-none transition-colors hover:bg-ink-100/40 focus:bg-ink-100/40 focus:px-1"
          aria-label="Workflow name"
          spellCheck={false}
        />
        <div className="text-[11px] text-ink-500">
          Orchestration Editor · {nodeCount}{" "}
          {nodeCount === 1 ? "node" : "nodes"}
        </div>
      </div>

      <StatusBanner
        saveError={saveError}
        showSavedFlash={showSavedFlash}
        lastSavedAt={lastSavedAt}
      />

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" aria-label="View" title="View">
          <Eye size={16} />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Search" title="Search">
          <Search size={16} />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Undo" title="Undo">
          <Undo2 size={16} />
        </Button>
        <Button variant="ghost" size="sm" aria-label="Settings" title="Settings">
          <Settings2 size={16} />
        </Button>

        <div className="mx-2 h-5 w-px bg-ink-100" />

        <Button
          variant="ghost"
          size="sm"
          onClick={handleImportClick}
          aria-label="Import"
          title="Import workflow JSON"
        >
          <Upload size={16} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExport}
          aria-label="Export"
          title="Export workflow JSON"
        >
          <Download size={16} />
        </Button>

        <div className="mx-2 h-5 w-px bg-ink-100" />

        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Play size={14} />}
          onClick={openRun}
        >
          Run
        </Button>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Save size={14} />}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileSelected}
        hidden
      />
    </header>
  );
}

interface StatusBannerProps {
  saveError: string | null;
  showSavedFlash: boolean;
  lastSavedAt: number | null;
}

function StatusBanner({
  saveError,
  showSavedFlash,
  lastSavedAt,
}: StatusBannerProps) {
  const baseClass =
    "mx-3 hidden h-7 items-center gap-2 rounded-md px-3 text-xs md:flex";

  if (saveError) {
    return (
      <div className={`${baseClass} bg-rose-50 text-rose-700`} title={saveError}>
        <span className="truncate" style={{ maxWidth: 360 }}>
          Save blocked — see details
        </span>
      </div>
    );
  }
  if (showSavedFlash && lastSavedAt) {
    return (
      <div className={`${baseClass} bg-emerald-50 text-emerald-700`}>
        Saved at {formatTime(lastSavedAt)}
      </div>
    );
  }
  if (lastSavedAt) {
    return (
      <div className={`${baseClass} bg-ink-100/40 text-ink-700`}>
        Last saved at {formatTime(lastSavedAt)}
      </div>
    );
  }
  return (
    <div className={`${baseClass} bg-amber-50 text-amber-800`}>
      Editing draft · changes are local until you save
    </div>
  );
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
