import { Button, RingProgress, ThemeIcon } from "@mantine/core";
import { IconChevronRight, IconTrophy } from "@tabler/icons-react";

import { VERDICT_COLOR, VERDICT_ORDER } from "../labels";
import type { AutomationPlan, ProcessGraph, Verdict } from "../types";
import { VERDICT_ICON } from "./Icon";

interface Props {
  graph: ProcessGraph;
  plan: AutomationPlan;
  onPick: (stepId: string) => void;
}

// A step worth starting with has to be one a computer can actually take on.
const RUNNABLE: Verdict[] = ["fully_automatable", "automatable_with_control"];

const SAYS: Record<Verdict, [string, string]> = {
  fully_automatable: ["runs itself", "run themselves"],
  automatable_with_control: ["needs a guard", "need a guard"],
  human_required: ["stays with you", "stay with you"],
  needs_more_info: ["unclear", "unclear"],
};

// Round the ring, in the order a reader should care: what runs alone first.
const RING: Verdict[] = ["fully_automatable", "automatable_with_control", "human_required", "needs_more_info"];

/**
 * The answer as a score, before any of the reasoning behind it.
 *
 * A ring and three counts say in a glance what a paragraph says in fifteen
 * seconds. The headline stays, underneath, for the one sentence of nuance the
 * numbers cannot carry.
 */
export function Overview({ graph, plan, onPick }: Props) {
  const total = plan.assessments.length || 1;
  const count = (v: Verdict) => plan.assessments.filter((a) => a.verdict === v).length;
  const counts = VERDICT_ORDER.map((verdict) => ({ verdict, count: count(verdict) })).filter(
    (c) => c.count > 0,
  );

  // Every time the code overruled the model, counted. It is the thing this
  // tool does that a chatbot would not, so it gets a badge rather than a line.
  const caught = plan.assessments.reduce((n, a) => n + (a.overrides ?? []).length, 0);
  const firstCaught = plan.assessments.find((a) => (a.overrides ?? []).length > 0)?.step_id;

  // The model names this, so it is only offered when the step can be handed
  // over. "Start here" on a step that stays with the person would be advice to
  // automate exactly the thing it should not.
  const win = graph.steps.find((s) => s.id === plan.biggest_win);
  const winVerdict = plan.assessments.find((a) => a.step_id === plan.biggest_win)?.verdict;
  const startWith = win && winVerdict && RUNNABLE.includes(winVerdict) ? win : null;

  return (
    <section className="card answer">
      <div className="score">
        <RingProgress
          size={104}
          thickness={9}
          roundCaps
          sectionGap={4}
          rootColor="var(--sunken)"
          sections={RING.filter((v) => count(v) > 0).map((v) => ({
            value: (count(v) / total) * 100,
            color: v === "needs_more_info" ? "gray.5" : VERDICT_COLOR[v],
          }))}
          label={
            <div className="ring__label">
              <strong>
                {count("fully_automatable")}/{plan.assessments.length}
              </strong>
              <span>hands-off</span>
            </div>
          }
          aria-label={`${count("fully_automatable")} of ${plan.assessments.length} steps run themselves`}
          role="img"
        />

        <ul className="stats">
          {counts.map(({ verdict, count: n }) => {
            const Pictured = VERDICT_ICON[verdict];
            return (
              <li key={verdict} className={`stat stat--${verdict}`}>
                <ThemeIcon size={26} radius="xl" variant="light" color={VERDICT_COLOR[verdict]}>
                  <Pictured size={15} stroke={2} />
                </ThemeIcon>
                <strong>{n}</strong> {SAYS[verdict][n === 1 ? 0 : 1]}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="answer__headline">{plan.headline}</p>

      {(caught > 0 || startWith) && (
        <div className="badges">
          {caught > 0 && firstCaught && (
            <Button
              size="compact-sm"
              radius="xl"
              variant="light"
              color="guard"
              leftSection={<IconTrophy size={15} />}
              onClick={() => onPick(firstCaught)}
              title="Where the code overruled the model. Click to see the first one."
            >
              {caught} caught by our checks
            </Button>
          )}
          {startWith && (
            <Button
              size="compact-sm"
              radius="xl"
              variant="default"
              rightSection={<IconChevronRight size={14} />}
              onClick={() => onPick(startWith.id)}
              className="badge--start"
            >
              Start with: {startWith.name}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
