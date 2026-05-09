import { useState } from "react";
import { Play, AlertCircle, CheckCircle2 } from "lucide-react";

import type { FieldSchema } from "@/workflow/types";
import { useFieldValue } from "@/components/forms/useField";
import { codeBase, subtleButton } from "@/components/forms/inputs";

interface RunResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  ms?: number;
}

/**
 * Test runner for the Script node. Reads the script body from a sibling
 * field on the same node (`meta.codeKey`, default `config.code`), accepts
 * a JSON test input from a local textarea, and runs the script via
 * `new Function(...)`.
 *
 * This is **client-side demo execution**. In production, scripts should
 * run in a server-side sandbox — `new Function` shares the page's global
 * scope, can access `window`, and can hang the tab.
 */
export function ScriptRunner({
  nodeId,
  field,
}: {
  nodeId: string;
  field: FieldSchema;
}) {
  const codeKey = (field.meta?.codeKey as string | undefined) ?? "config.code";
  const code = useFieldValue<string>(nodeId, codeKey) ?? "";

  const [inputJson, setInputJson] = useState("{}");
  const [result, setResult] = useState<RunResult | null>(null);

  const run = () => {
    let input: unknown = {};
    try {
      if (inputJson.trim() !== "") input = JSON.parse(inputJson);
    } catch (e) {
      setResult({
        ok: false,
        error: `Invalid test input JSON: ${e instanceof Error ? e.message : String(e)}`,
      });
      return;
    }

    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("input", code);
      const t0 = performance.now();
      const output = fn(input);
      const ms = Math.round(performance.now() - t0);
      setResult({ ok: true, output, ms });
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-medium text-ink-700">
        Test input (JSON)
      </label>
      <textarea
        value={inputJson}
        onChange={(e) => setInputJson(e.target.value)}
        rows={4}
        spellCheck={false}
        placeholder='{"foo": "bar"}'
        className={codeBase}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          className={`${subtleButton} border-solid border-brand-500 text-brand-600 hover:bg-brand-500/5`}
        >
          <Play size={12} /> Test Script
        </button>
        <span className="text-[10px] italic text-ink-500">
          Demo only — production should sandbox server-side.
        </span>
      </div>

      {result && (
        <div
          className={
            result.ok
              ? "rounded-md border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-800"
              : "rounded-md border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800"
          }
        >
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold">
            {result.ok ? (
              <>
                <CheckCircle2 size={13} /> OK
                {typeof result.ms === "number" && (
                  <span className="font-normal opacity-75">· {result.ms}ms</span>
                )}
              </>
            ) : (
              <>
                <AlertCircle size={13} /> Error
              </>
            )}
          </div>
          {result.ok ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]">
              {safeStringify(result.output)}
            </pre>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-[10px]">
              {result.error}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
