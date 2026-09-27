import { VERDICT_ORDER } from "../labels";
import type { AutomationPlan, ProcessGraph, Verdict } from "../types";
import { Icon, VERDICT_ICON } from "./Icon";

interface Props {
  graph: ProcessGraph;
  plan: AutomationPlan;
  onPick: (stepId: string) => void;
}

// A step worth starting with has to be one a computer can actually take on.
const RUNNABLE: Verdict[] = ["fully_automatable", "automatable_with_control"];

const COLOUR: Record<Verdict, string> = {
  fully_automatable: "var(--auto)",
  automatable_with_control: "var(--guard)",
  human_required: "var(--human)",
  needs_more_info: "var(--unclear)",
};

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
  const counts = VERDICT_ORDER.map((verdict) => ({
    verdict,
    count: plan.assessments.filter((a) => a.verdict === verdict).length,
  })).filter((c) => c.count > 0);
  const count = (v: Verdict) => plan.assessments.filter((a) => a.verdict === v).length;

  let at = 0;
  const stops = RING.filter((v) => count(v) > 0).map((v) => {
    const from = at;
    at += (count(v) / total) * 100;
    return `${COLOUR[v]} ${from}% ${at}%`;
  });

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
        <div
          className="ring"
          style={{ background: `conic-gradient(${stops.join(", ")})` }}
          role="img"
          aria-label={`${count("fully_automatable")} of ${plan.assessments.length} steps run themselves`}
        >
          <div className="ring__hole">
            <strong>
              {count("fully_automatable")}/{plan.assessments.length}
            </strong>
            <span>hands-off</span>
          </div>
        </div>

        <ul className="stats">
          {counts.map(({ verdict, count: n }) => (
            <li key={verdict} className={`stat stat--${verdict}`}>
              <Icon name={VERDICT_ICON[verdict]} />
              <strong>{n}</strong> {SAYS[verdict][n === 1 ? 0 : 1]}
            </li>
          ))}
        </ul>
      </div>

      <p className="answer__headline">{plan.headline}</p>

      {(caught > 0 || startWith) && (
        <div className="badges">
          {caught > 0 && firstCaught && (
            <button
              className="badge badge--caught"
              onClick={() => onPick(firstCaught)}
              title="Where the code overruled the model. Click to see the first one."
            >
              <Icon name="trophy" />
              {caught} caught by our checks
            </button>
          )}
          {startWith && (
            <button className="badge" onClick={() => onPick(startWith.id)}>
              Start with: {startWith.name}
              <Icon name="chevron" size={14} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
