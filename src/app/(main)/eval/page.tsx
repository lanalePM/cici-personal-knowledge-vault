"use client";

import { useState, useEffect, useRef } from "react";
import TopBar from "@/components/layout/TopBar";
import Sidebar from "@/components/layout/Sidebar";
import { DIMENSION_LABELS, type EvalDimension } from "@/lib/ai/eval-types";
import { Play, Trash2, ChevronDown, ChevronRight, RefreshCw, UploadCloud, X, FileJson } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type EvalMode = "vault" | "chat" | "scout" | "dataset";

type DatasetCase =
  | { type: "summarization"; label: string; source: string; summary: string; tags?: string[] }
  | { type: "rag"; label: string; question: string; context: string; answer: string }
  | { type: "scout"; label: string; interest_profile: string; article_title: string; article_description: string; expected_decision: "saved" | "dismissed" };

type EvalRun = {
  id: string;
  mode: EvalMode;
  status: "running" | "done" | "failed";
  item_count: number;
  avg_scores: Record<string, number>;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

type EvalResult = {
  id: string;
  subject_type: string;
  subject_id: string;
  subject_label: string;
  dimension: string;
  score: number;
  reasoning: string;
  created_at: string;
};

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 4.5
      ? "bg-green-100 text-green-700"
      : score >= 3.5
      ? "bg-accent-light text-accent"
      : score >= 2.5
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${cls}`}>
      {score}
    </span>
  );
}

// ── Score card ────────────────────────────────────────────────────────────────

function ScoreCard({ dimension, score }: { dimension: string; score: number }) {
  const label = DIMENSION_LABELS[dimension as EvalDimension] ?? dimension;
  const pct = ((score - 1) / 4) * 100;
  const barColor =
    score >= 4.5
      ? "bg-green-500"
      : score >= 3.5
      ? "bg-accent"
      : score >= 2.5
      ? "bg-amber-400"
      : "bg-red-500";

  return (
    <div className="bg-bg-secondary border border-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary font-medium">{label}</span>
        <span className="text-xl font-bold">{score}</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text-tertiary">out of 5</span>
    </div>
  );
}

// ── Subject row ───────────────────────────────────────────────────────────────

function SubjectRow({ label, results }: { label: string; results: EvalResult[] }) {
  const [open, setOpen] = useState(false);
  const avg =
    Math.round((results.reduce((s, r) => s + r.score, 0) / results.length) * 10) / 10;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-hover text-left"
      >
        {open
          ? <ChevronDown size={14} className="shrink-0 text-text-tertiary" />
          : <ChevronRight size={14} className="shrink-0 text-text-tertiary" />}
        <span className="flex-1 text-sm font-medium truncate">{label}</span>
        <ScoreBadge score={avg} />
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {results.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-text-secondary font-medium block mb-1">
                  {DIMENSION_LABELS[r.dimension as EvalDimension] ?? r.dimension}
                </span>
                <p className="text-xs text-text-tertiary leading-relaxed">{r.reasoning}</p>
              </div>
              <ScoreBadge score={r.score} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Run detail panel ──────────────────────────────────────────────────────────

function RunDetail({ run, onDelete }: { run: EvalRun; onDelete: () => void }) {
  const [results, setResults] = useState<EvalResult[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/eval/${run.id}`)
      .then((r) => r.json())
      .then((d) => setResults(d.results ?? []))
      .finally(() => setLoading(false));
  }, [run.id]);

  const bySubject = new Map<string, { label: string; results: EvalResult[] }>();
  for (const r of results ?? []) {
    if (!bySubject.has(r.subject_id)) {
      bySubject.set(r.subject_id, { label: r.subject_label, results: [] });
    }
    bySubject.get(r.subject_id)!.results.push(r);
  }
  const subjects = Array.from(bySubject.entries());

  const modeLabel =
    run.mode === "vault" ? "Vault items"
    : run.mode === "chat" ? "Chat history"
    : run.mode === "scout" ? "Scout agent"
    : "Dataset";
  const date = new Date(run.created_at).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">{modeLabel} eval</h2>
          <p className="text-xs text-text-tertiary mt-0.5">{date} · {run.item_count} items</p>
        </div>
        <button
          onClick={onDelete}
          className="p-1.5 text-text-tertiary hover:text-error rounded-md hover:bg-bg-hover"
          title="Delete run"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {run.status === "failed" && (
        <div className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {run.error ?? "Eval run failed."}
        </div>
      )}

      {Object.keys(run.avg_scores).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Average Scores
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(run.avg_scores).map(([dim, score]) => (
              <ScoreCard key={dim} dimension={dim} score={score} />
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-text-tertiary text-center py-8">Loading results…</div>
      ) : subjects.length === 0 ? (
        <div className="text-sm text-text-tertiary text-center py-8">No results recorded.</div>
      ) : (
        <div>
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Per-item Results ({subjects.length})
          </h3>
          <div className="flex flex-col gap-2">
            {subjects.map(([id, { label, results: rs }]) => (
              <SubjectRow key={id} label={label} results={rs} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dataset uploader ──────────────────────────────────────────────────────────

function DatasetUploader({
  cases,
  onLoad,
  onClear,
  parseError,
}: {
  cases: DatasetCase[] | null;
  onLoad: (cases: DatasetCase[], fileName: string) => void;
  onClear: () => void;
  parseError: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (!Array.isArray(parsed)) throw new Error("File must be a JSON array.");
        onLoad(parsed as DatasetCase[], file.name);
      } catch (err) {
        onLoad([], file.name);
        // surface error via parseError prop set by parent
        console.error(err);
      }
    };
    reader.readAsText(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  if (cases !== null) {
    const summCount = cases.filter((c) => c.type === "summarization").length;
    const ragCount = cases.filter((c) => c.type === "rag").length;
    const scoutCount = cases.filter((c) => c.type === "scout").length;

    const typeTag = (type: string) => {
      if (type === "summarization") return { label: "SUMM", cls: "bg-accent-light text-accent" };
      if (type === "rag") return { label: "RAG", cls: "bg-amber-100 text-amber-700" };
      return { label: "SCOUT", cls: "bg-green-100 text-green-700" };
    };

    return (
      <div className="flex flex-col gap-2">
        <div className="bg-bg-secondary border border-border rounded-lg p-3 flex items-start gap-3">
          <FileJson size={16} className="text-accent shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{fileName}</p>
            <p className="text-xs text-text-tertiary mt-0.5">
              {cases.length} cases
              {summCount > 0 && ` · ${summCount} summarization`}
              {ragCount > 0 && ` · ${ragCount} RAG`}
              {scoutCount > 0 && ` · ${scoutCount} scout`}
            </p>
          </div>
          <button onClick={onClear} className="text-text-tertiary hover:text-text-primary shrink-0">
            <X size={14} />
          </button>
        </div>

        {parseError && (
          <p className="text-xs text-error">{parseError}</p>
        )}

        {cases.length > 0 && (
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {cases.map((c, i) => {
              const { label: tl, cls } = typeTag(c.type);
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 rounded-md bg-bg-secondary border border-border"
                >
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>{tl}</span>
                  <span className="text-xs truncate text-text-secondary">{c.label || `Case ${i + 1}`}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg px-3 py-6 cursor-pointer transition-colors ${
        dragging
          ? "border-accent bg-accent-light"
          : "border-border hover:border-accent/50 hover:bg-bg-hover"
      }`}
    >
      <UploadCloud size={20} className="text-text-tertiary" />
      <p className="text-xs text-text-secondary text-center">
        Drop a <span className="font-medium">.json</span> file here<br />or click to browse
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Controls panel (shared between sidebar + mobile) ─────────────────────────

function Controls({
  mode,
  setMode,
  sampleSize,
  setSampleSize,
  datasetCases,
  onDatasetLoad,
  onDatasetClear,
  datasetParseError,
  running,
  onRun,
}: {
  mode: EvalMode;
  setMode: (m: EvalMode) => void;
  sampleSize: number;
  setSampleSize: (n: number) => void;
  datasetCases: DatasetCase[] | null;
  onDatasetLoad: (cases: DatasetCase[], fileName: string) => void;
  onDatasetClear: () => void;
  datasetParseError: string | null;
  running: boolean;
  onRun: () => void;
}) {
  const canRun =
    !running &&
    (mode !== "dataset" || (datasetCases !== null && datasetCases.length > 0));

  // Scout mode helper text
  const scoutHint = mode === "scout"
    ? "Evaluates your saved/dismissed suggestions to check if the agent scored them correctly."
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">Mode</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as EvalMode)}
          className="text-sm bg-bg-secondary border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="vault">Vault items</option>
          <option value="chat">Chat history</option>
          <option value="scout">Scout agent</option>
          <option value="dataset">Golden dataset</option>
        </select>
      </div>

      {mode !== "dataset" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-secondary">Sample size (max 20)</label>
          <input
            type="number"
            min={1}
            max={20}
            value={sampleSize}
            onChange={(e) => setSampleSize(Math.min(20, Math.max(1, Number(e.target.value))))}
            className="text-sm bg-bg-secondary border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
      )}

      {mode === "dataset" && (
        <DatasetUploader
          cases={datasetCases}
          onLoad={onDatasetLoad}
          onClear={onDatasetClear}
          parseError={datasetParseError}
        />
      )}

      <button
        onClick={onRun}
        disabled={!canRun}
        className="flex items-center justify-center gap-2 bg-accent text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {running
          ? <><RefreshCw size={14} className="animate-spin" /> Running…</>
          : <><Play size={14} /> Run Eval</>}
      </button>

      {running && (
        <p className="text-xs text-text-tertiary text-center">This may take 20–60 seconds…</p>
      )}

      {scoutHint && !running && (
        <p className="text-xs text-text-tertiary text-center leading-relaxed">{scoutHint}</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EvalPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<EvalMode>("vault");
  const [sampleSize, setSampleSize] = useState(10);
  const [datasetCases, setDatasetCases] = useState<DatasetCase[] | null>(null);
  const [datasetParseError, setDatasetParseError] = useState<string | null>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  async function loadRuns() {
    const res = await fetch("/api/eval");
    const data = await res.json();
    const list: EvalRun[] = data.runs ?? [];
    setRuns(list);
    if (list.length > 0 && !selectedRunId) {
      setSelectedRunId(list[0].id);
    }
  }

  function handleDatasetLoad(cases: DatasetCase[], _fileName: string) {
    if (!Array.isArray(cases) || cases.length === 0) {
      setDatasetParseError("No valid cases found. Check the file format.");
      setDatasetCases([]);
    } else {
      setDatasetParseError(null);
      setDatasetCases(cases);
    }
  }

  function handleDatasetClear() {
    setDatasetCases(null);
    setDatasetParseError(null);
  }

  async function startRun() {
    setRunning(true);
    try {
      const body: Record<string, unknown> = { mode, sample_size: sampleSize };
      if (mode === "dataset") body.dataset = datasetCases;

      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Eval failed");
        return;
      }
      await loadRuns();
      setSelectedRunId(data.run_id);
    } finally {
      setRunning(false);
    }
  }

  async function deleteRun(runId: string) {
    await fetch(`/api/eval/${runId}`, { method: "DELETE" });
    const next = runs.filter((r) => r.id !== runId);
    setRuns(next);
    if (selectedRunId === runId) {
      setSelectedRunId(next.length > 0 ? next[0].id : null);
    }
  }

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  const statusDot = (status: EvalRun["status"]) =>
    status === "done" ? "bg-green-500" : status === "failed" ? "bg-red-500" : "bg-amber-400";

  const controlProps = {
    mode, setMode,
    sampleSize, setSampleSize,
    datasetCases, onDatasetLoad: handleDatasetLoad, onDatasetClear: handleDatasetClear,
    datasetParseError,
    running, onRun: startRun,
  };

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary">
      <TopBar
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        onSearch={() => {}}
        searchQuery=""
      />

      <div className="flex flex-1 min-h-0">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeFilter="all"
          onFilterChange={() => {}}
          activeTag={null}
          onTagSelect={() => {}}
          tags={[]}
        />

        {/* Left: controls + run history */}
        <aside className="w-64 shrink-0 border-r border-border hidden lg:flex flex-col overflow-y-auto">
          <div className="p-4 border-b border-border flex flex-col gap-3">
            <h1 className="text-sm font-semibold">Eval Dashboard</h1>
            <Controls {...controlProps} />
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {runs.length === 0 ? (
              <p className="text-xs text-text-tertiary px-4 py-6 text-center">No runs yet.</p>
            ) : (
              runs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRunId(r.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-bg-hover flex items-center gap-2 ${
                    selectedRunId === r.id ? "bg-bg-hover" : ""
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(r.status)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate capitalize">{r.mode} eval</p>
                    <p className="text-xs text-text-tertiary">
                      {new Date(r.created_at).toLocaleDateString(undefined, {
                        month: "short", day: "numeric",
                      })}
                      {" · "}{r.item_count} items
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Right: run detail */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Mobile controls */}
          <div className="lg:hidden mb-6 p-4 bg-bg-secondary border border-border rounded-xl">
            <Controls {...controlProps} />
          </div>

          {selectedRun ? (
            <RunDetail
              key={selectedRun.id}
              run={selectedRun}
              onDelete={() => deleteRun(selectedRun.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="text-4xl opacity-20">⚖</div>
              <p className="text-text-secondary text-sm max-w-xs">
                Run an eval to measure the quality of your vault summaries, tags, and chat answers.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
