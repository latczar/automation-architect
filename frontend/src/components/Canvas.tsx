import { useRef, useState, type KeyboardEvent } from "react";

import type { AutomationPlan, Blueprint, EffortInput, ProcessGraph } from "../types";
import { BuildPlan } from "./BuildPlan";
import { Connections } from "./Connections";
import { Diagram } from "./Diagram";
import { Effort } from "./Effort";
import { Verdicts } from "./Verdicts";

export type Tab = "map" | "connects" | "build" | "time";

interface Props {
  graph: ProcessGraph;
  plan: AutomationPlan | null;
  blueprint: Blueprint | null;
  tab: Tab;
  onTab: (tab: Tab) => void;
  selected: string | null;
  onSelect: (stepId: string | null) => void;
  /** Working on a new answer, so what is showing is about to be replaced. */
  busy: boolean;
  readOnly: boolean;

  onShare: () => void;
  sharing: boolean;
  shareUrl: string | null;
  shareExpiry: string | null;
  onCopyLink: () => void;
  linkCopied: boolean;

  onCopy: () => void;
  copying: boolean;
  handoff: "copied" | "downloaded" | null;
  onDownload: () => void;

  effort: EffortInput | null;
  onEffort: (effort: EffortInput | null) => void;
  onQuestions: () => void;
}

/**
 * The thing being built, beside the conversation about it.
 *
 * One screen split into tabs rather than one page that scrolls forever. The
 * map comes first because it is the answer; how it connects and how to build
 * it are the next two questions anybody asks, in that order. Every tab stays
 * mounted and is only hidden, so numbers typed into one survive a look at
 * another, and the diagram does not have to lay itself out again.
 */
export function Canvas(props: Props) {
  const { graph, plan, blueprint, tab, onTab, busy, readOnly } = props;
  const list = useRef<HTMLDivElement>(null);

  // Reported by the checklist as boxes are ticked, so the tab counts down too.
  const [left, setLeft] = useState(() => blueprint?.tasks.filter((t) => t.status !== "done").length ?? 0);
  // The ticks are kept per analysis: the same process mapped the same way.
  const saveAs = `${graph.title}|${graph.steps.map((s) => s.id).join(",")}`;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "map", label: "Map" },
    ...(blueprint
      ? [
          { id: "connects" as const, label: "Connections", count: blueprint.places.length },
          { id: "build" as const, label: "Build it", count: left },
        ]
      : []),
    ...(plan ? [{ id: "time" as const, label: "Time" }] : []),
  ];

  // Arrow keys move along the tabs, as they do in any tab strip.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const at = tabs.findIndex((t) => t.id === tab);
    const next = tabs[(at + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onTab(next.id);
    list.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  }

  return (
    <section className="canvas" aria-label="Blueprint">
      <header className="canvas__head">
        <div className="canvas__title">
          <h2>{graph.title}</h2>
          <p>{graph.summary}</p>
        </div>
        <div className="canvas__actions">
          {!readOnly && (
            <button
              className="secondary"
              onClick={props.onShare}
              disabled={props.sharing}
              title="A link anyone can open. Expires after 30 days."
            >
              {props.sharing ? "Creating..." : "Share"}
            </button>
          )}
          <button
            onClick={props.onCopy}
            disabled={props.copying}
            title="Copies the workflow. Paste it onto an n8n canvas."
          >
            {props.copying ? "Building..." : props.handoff === "copied" ? "Copied" : "Copy for n8n"}
          </button>
        </div>
      </header>

      {props.handoff && (
        <p className="handoff">
          {props.handoff === "copied" ? (
            <>
              On your clipboard. Open n8n, click the empty canvas and press <kbd>Ctrl</kbd>+
              <kbd>V</kbd>.{" "}
            </>
          ) : (
            <>
              Your browser would not let the page use the clipboard, so the workflow
              downloaded instead. In n8n, use Import from File.{" "}
            </>
          )}
          The Build it tab lists what is left to connect.{" "}
          {props.handoff === "copied" && (
            <button className="linkish" onClick={props.onDownload}>
              Download the file instead
            </button>
          )}
        </p>
      )}

      {props.shareUrl && (
        <div className="sharebox">
          <div className="sharebox__row">
            <input readOnly value={props.shareUrl} onFocus={(e) => e.target.select()} />
            <button onClick={props.onCopyLink}>{props.linkCopied ? "Copied" : "Copy"}</button>
          </div>
          <p className="sharebox__note">
            Anyone with this link can read the analysis, so treat it as public. Do not share
            one containing customer names or anything confidential.
            {props.shareExpiry && (
              <> It stops working on {new Date(props.shareExpiry).toLocaleDateString("en-GB")}.</>
            )}
          </p>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Blueprint" ref={list} onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            data-tab={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`tabs__tab ${tab === t.id ? "tabs__tab--current" : ""}`}
            onClick={() => onTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && <span className="tabs__count">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className={`canvas__body ${busy ? "canvas__body--stale" : ""}`}>
        {busy && (
          <p className="canvas__redrawing" role="status">
            Redrawing. This is the last map until the new one arrives.
          </p>
        )}

        <div
          role="tabpanel"
          id="panel-map"
          aria-labelledby="tab-map"
          hidden={tab !== "map"}
          className="maptab"
        >
          <div className="maptab__diagram">
            <Diagram graph={graph} plan={plan} selected={props.selected} onSelect={props.onSelect} />
          </div>
          <div className="maptab__list">
            {plan ? (
              <>
                <p className="maptab__lead">
                  Anything that needs you comes first. Click a step in the map to find out
                  why it got its verdict.
                </p>
                <Verdicts
                  graph={graph}
                  plan={plan}
                  selected={props.selected}
                  onSelect={props.onSelect}
                />
              </>
            ) : (
              <p className="muted">The process was mapped, but not judged.</p>
            )}
          </div>
        </div>

        {blueprint && (
          <div
            role="tabpanel"
            id="panel-connects"
            aria-labelledby="tab-connects"
            hidden={tab !== "connects"}
            className="tabpanel"
          >
            <Connections blueprint={blueprint} />
          </div>
        )}

        {blueprint && (
          <div
            role="tabpanel"
            id="panel-build"
            aria-labelledby="tab-build"
            hidden={tab !== "build"}
            className="tabpanel"
          >
            <BuildPlan
              tasks={blueprint.tasks}
              onCopy={props.onCopy}
              copying={props.copying}
              copied={props.handoff !== null}
              onQuestions={props.onQuestions}
              saveAs={saveAs}
              onLeft={setLeft}
            />
          </div>
        )}

        {plan && (
          <div
            role="tabpanel"
            id="panel-time"
            aria-labelledby="tab-time"
            hidden={tab !== "time"}
            className="tabpanel"
          >
            <section className="card time">
              <h2>Time it takes</h2>
              <Effort graph={graph} plan={plan} initial={props.effort} onChange={props.onEffort} />
            </section>
          </div>
        )}
      </div>
    </section>
  );
}
