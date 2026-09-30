import { useState } from "react";
import { Badge, Button, Kbd, Tabs } from "@mantine/core";
import {
  IconCircleCheck,
  IconClipboardCopy,
  IconClock,
  IconListCheck,
  IconMap,
  IconPlug,
  IconShare3,
  type TablerIcon,
} from "@tabler/icons-react";

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
 * another, and the diagram does not have to lay itself out again. Mantine's
 * tabs bring the arrow keys and the roles with them.
 */
export function Canvas(props: Props) {
  const { graph, plan, blueprint, tab, onTab, busy, readOnly } = props;

  // Reported by the checklist as boxes are ticked, so the tab counts down too.
  const [left, setLeft] = useState(() => blueprint?.tasks.filter((t) => t.status !== "done").length ?? 0);
  // The ticks are kept per analysis: the same process mapped the same way.
  const saveAs = `${graph.title}|${graph.steps.map((s) => s.id).join(",")}`;
  const tabs: { id: Tab; label: string; icon: TablerIcon; count?: number }[] = [
    { id: "map", label: "Map", icon: IconMap },
    ...(blueprint
      ? [
          { id: "connects" as const, label: "Connections", icon: IconPlug, count: blueprint.places.length },
          { id: "build" as const, label: "Build it", icon: IconListCheck, count: left },
        ]
      : []),
    ...(plan ? [{ id: "time" as const, label: "Time", icon: IconClock }] : []),
  ];

  return (
    <section className="canvas" aria-label="Blueprint">
      <header className="canvas__head">
        <div className="canvas__title">
          <h2>{graph.title}</h2>
          <p>{graph.summary}</p>
        </div>
        <div className="canvas__actions">
          {!readOnly && (
            <Button
              variant="default"
              leftSection={<IconShare3 size={16} />}
              onClick={props.onShare}
              loading={props.sharing}
              title="A link anyone can open. Expires after 30 days."
            >
              Share
            </Button>
          )}
          <Button
            leftSection={
              props.handoff === "copied" ? <IconCircleCheck size={16} /> : <IconClipboardCopy size={16} />
            }
            onClick={props.onCopy}
            loading={props.copying}
            title="Copies the workflow. Paste it onto an n8n canvas."
          >
            {props.handoff === "copied" ? "Copied" : "Copy for n8n"}
          </Button>
        </div>
      </header>

      {props.handoff && (
        <p className="handoff">
          <IconCircleCheck size={18} aria-hidden="true" />
          {props.handoff === "copied" ? (
            <>
              On your clipboard. Open n8n, click the empty canvas and press <Kbd>Ctrl</Kbd> +{" "}
              <Kbd>V</Kbd>.{" "}
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
            <Button onClick={props.onCopyLink}>{props.linkCopied ? "Copied" : "Copy"}</Button>
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

      <Tabs
        className="canvas__tabs"
        value={tab}
        onChange={(value) => value && onTab(value as Tab)}
        keepMounted
        keepMountedMode="display-none"
      >
        <Tabs.List className="tabs" aria-label="Blueprint">
          {tabs.map(({ id, label, icon: Pictured, count }) => (
            <Tabs.Tab
              key={id}
              value={id}
              leftSection={<Pictured size={16} stroke={1.8} />}
              rightSection={
                count !== undefined && count > 0 ? (
                  <Badge size="sm" variant="light" color={id === "build" ? "forest" : "gray"} circle>
                    {count}
                  </Badge>
                ) : null
              }
            >
              {label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <div className={`canvas__body ${busy ? "canvas__body--stale" : ""}`}>
          {busy && (
            <p className="canvas__redrawing" role="status">
              Redrawing. This is the last map until the new one arrives.
            </p>
          )}

          <Tabs.Panel value="map" className="maptab">
            <div className="maptab__diagram">
              <Diagram graph={graph} plan={plan} selected={props.selected} onSelect={props.onSelect} />
            </div>
            <div className="maptab__list">
              {plan ? (
                <Verdicts
                  graph={graph}
                  plan={plan}
                  selected={props.selected}
                  onSelect={props.onSelect}
                />
              ) : (
                <p className="muted">The process was mapped, but not judged.</p>
              )}
            </div>
          </Tabs.Panel>

          {blueprint && (
            <Tabs.Panel value="connects" className="tabpanel">
              <Connections blueprint={blueprint} />
            </Tabs.Panel>
          )}

          {blueprint && (
            <Tabs.Panel value="build" className="tabpanel">
              <BuildPlan
                tasks={blueprint.tasks}
                onCopy={props.onCopy}
                copying={props.copying}
                copied={props.handoff !== null}
                onQuestions={props.onQuestions}
                saveAs={saveAs}
                onLeft={setLeft}
              />
            </Tabs.Panel>
          )}

          {plan && (
            <Tabs.Panel value="time" className="tabpanel">
              <Effort graph={graph} plan={plan} initial={props.effort} onChange={props.onEffort} />
            </Tabs.Panel>
          )}
        </div>
      </Tabs>
    </section>
  );
}
