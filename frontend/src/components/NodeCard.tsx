import { IconShieldCheck } from "@tabler/icons-react";

import { VERDICT_LABEL } from "../labels";
import type { StepKind, Verdict } from "../types";
import { KIND_ICON, VERDICT_ICON } from "./Icon";

interface Props {
  label: string;
  kind: StepKind;
  verdict: Verdict | null;
  /** A guard on a step whose verdict does not already say so. */
  hasControl?: boolean;
  selected?: boolean;
}

/**
 * One step, drawn the same way on the map and in the preview on the first
 * screen, so the colours somebody learns there are exactly the ones they meet.
 *
 * Deliberately free of React Flow, so the first screen can draw these without
 * loading the diagram library.
 */
export function NodeCard({ label, kind, verdict, hasControl = false, selected = false }: Props) {
  const judged = verdict ?? "needs_more_info";
  const Kind = KIND_ICON[kind];
  const Verdict = VERDICT_ICON[judged];

  return (
    <div
      className={`node node--${judged} ${selected ? "node--active" : ""}`}
      data-decision={kind === "decision"}
    >
      <div className="node__top">
        <span className="node__kind-icon">
          <Kind size={14} stroke={2} aria-hidden="true" />
        </span>
        <span className="node__kind">{kind}</span>
        {/* On a step that already says it needs a guard, a second one is noise. */}
        {hasControl && judged !== "automatable_with_control" && (
          <span className="node__guard" title="Has a guard">
            <IconShieldCheck size={14} stroke={2} aria-label="Has a guard" />
          </span>
        )}
      </div>
      <div className="node__label">{label}</div>
      <span className="node__verdict">
        <Verdict size={12} stroke={2.2} aria-hidden="true" />
        {VERDICT_LABEL[judged]}
      </span>
    </div>
  );
}
