import {
  IconBolt,
  IconClock,
  IconHelpCircle,
  IconListCheck,
  IconShieldCheck,
  IconUser,
  type TablerIcon,
} from "@tabler/icons-react";

import { VERDICT_LABEL } from "../labels";
import type { AutomationPlan, ProcessGraph, Verdict } from "../types";

interface Props {
  graph: ProcessGraph;
  plan: AutomationPlan | null;
  /** Items still to tick on the build list, once there is one. */
  left: number | null;
  /** Hours a month that could run without the person, once worked out. */
  hours: number | null;
  selected: string | null;
  onPick: (stepId: string) => void;
}

const RESOURCES: { verdict: Verdict; icon: TablerIcon; label: string }[] = [
  { verdict: "fully_automatable", icon: IconBolt, label: "hands-off" },
  { verdict: "automatable_with_control", icon: IconShieldCheck, label: "guarded" },
  { verdict: "human_required", icon: IconUser, label: "with you" },
  { verdict: "needs_more_info", icon: IconHelpCircle, label: "unclear" },
];

/** "45m" under an hour, "3.5h" over it: a counter has room for a few characters. */
function short(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

/**
 * The process at a glance, the way a strategy game shows what you have.
 *
 * Counters along the top, as resources, and the steps underneath them in
 * order, one block each in its verdict's colour, like a row of units. A block
 * picks its step, so the strip is also the quickest way round a long map.
 */
export function Hud({ graph, plan, left, hours, selected, onPick }: Props) {
  if (!plan) return null;

  const verdictOf = (stepId: string): Verdict =>
    plan.assessments.find((a) => a.step_id === stepId)?.verdict ?? "needs_more_info";
  const count = (verdict: Verdict) => plan.assessments.filter((a) => a.verdict === verdict).length;

  return (
    <div className="hud" role="group" aria-label="The process at a glance">
      <ul className="hud__resources">
        {RESOURCES.filter((r) => r.verdict !== "needs_more_info" || count(r.verdict) > 0).map(
          ({ verdict, icon: Pictured, label }) => (
            <li key={verdict} className={`hud__resource stat--${verdict}`}>
              <span className="hud__icon">
                <Pictured size={14} stroke={2.4} aria-hidden="true" />
              </span>
              <strong>{count(verdict)}</strong>
              <span className="hud__label">{label}</span>
            </li>
          ),
        )}
        {left !== null && (
          <li className="hud__resource hud__resource--build">
            <span className="hud__icon">
              <IconListCheck size={14} stroke={2.4} aria-hidden="true" />
            </span>
            <strong>{left}</strong>
            <span className="hud__label">to build</span>
          </li>
        )}
        {hours !== null && hours > 0 && (
          <li className="hud__resource hud__resource--time">
            <span className="hud__icon">
              <IconClock size={14} stroke={2.4} aria-hidden="true" />
            </span>
            <strong>{short(hours)}</strong>
            <span className="hud__label">back a month</span>
          </li>
        )}
      </ul>

      <ol className="hud__squad" aria-label="Each step, in order">
        {graph.steps.map((step) => {
          const verdict = verdictOf(step.id);
          return (
            <li key={step.id}>
              <button
                className={`hud__unit stat--${verdict} ${selected === step.id ? "hud__unit--active" : ""}`}
                title={`${step.name}: ${VERDICT_LABEL[verdict]}`}
                aria-label={`${step.name}, ${VERDICT_LABEL[verdict]}`}
                aria-pressed={selected === step.id}
                onClick={() => onPick(step.id)}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
