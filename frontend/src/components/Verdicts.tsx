import { useEffect, useRef } from "react";

import { plainly, VERDICT_LABEL as LABEL, VERDICT_ORDER as ORDER } from "../labels";
import type { AutomationPlan, Override, ProcessGraph } from "../types";
import { Icon, VERDICT_ICON } from "./Icon";

const OVERRIDE_KIND: Record<Override["kind"], string> = {
  risk_added: "Risk added",
  verdict_downgraded: "Verdict lowered",
  control_added: "Guard added",
};

interface Props {
  graph: ProcessGraph;
  plan: AutomationPlan;
  selected: string | null;
  onSelect: (stepId: string | null) => void;
}

export function Verdicts({ graph, plan, selected, onSelect }: Props) {
  const nameOf = (id: string) =>
    graph.steps.find((s) => s.id === id)?.name ?? id;

  // Picking a step in the diagram, or from "worth doing first", brings its
  // verdict into view. "nearest" moves whichever container holds the card, and
  // only if it has to: a card already in sight jumping about under the pointer
  // is worse than not moving at all.
  const list = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selected) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-step="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // Anything needing attention first. A list that opens with six green rows
  // buries the one thing the reader actually has to decide about.
  const sorted = [...plan.assessments].sort(
    (a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict),
  );

  // One line per step until one is picked, then everything about that one.
  // Seven cards of full reasoning at once is a wall; seven headlines is a list
  // somebody can actually scan.
  return (
    <section className="verdicts" ref={list}>
      {sorted.map((assessment) => {
        const open = selected === assessment.step_id;
        const caught = (assessment.overrides ?? []).length;
        return (
          <article
            key={assessment.step_id}
            data-step={assessment.step_id}
            className={`verdict verdict--${assessment.verdict} ${open ? "verdict--active" : ""}`}
            onClick={() => onSelect(open ? null : assessment.step_id)}
            aria-expanded={open}
          >
            <header>
              <span className="verdict__icon">
                <Icon name={VERDICT_ICON[assessment.verdict]} />
              </span>
              <div className="verdict__names">
                <span className="verdict__tag">{LABEL[assessment.verdict]}</span>
                <h3>{nameOf(assessment.step_id)}</h3>
              </div>
              {caught > 0 && (
                <span className="verdict__caught" title="The code overruled the model here">
                  <Icon name="trophy" size={13} />
                  {caught}
                </span>
              )}
              <span className="verdict__more">
                <Icon name="chevron" size={14} />
              </span>
            </header>

            <p className="verdict__why">{assessment.rationale}</p>

            {open && (
              <>
              {/* The one thing on this page that is ours rather than the model's.
                  Without it a verdict we corrected and a verdict it got right look
                  exactly the same, and the correction is the whole point. */}
              {(assessment.overrides ?? []).length > 0 && (
                <div className="override">
                  <strong className="override__title">
                    We overruled the model on this step
                  </strong>
                  {(assessment.overrides ?? []).map((override, index) => (
                    <p key={index} className="override__line">
                      <span className="override__change">
                        <span className="override__kind">{OVERRIDE_KIND[override.kind]}</span>
                        <s className="override__was">{plainly(override.was)}</s>{" "}
                        <span aria-hidden="true">&rarr;</span>{" "}
                        <strong className="override__now">{plainly(override.now)}</strong>
                      </span>
                      {override.because}
                    </p>
                  ))}
                </div>
              )}

              {assessment.risks.length > 0 && (
                <p className="verdict__risks">
                  {assessment.risks.map((risk) => (
                    <span key={risk} className="chip">
                      {risk.replace(/_/g, " ")}
                    </span>
                  ))}
                </p>
              )}

              {assessment.controls.map((control, index) => (
                <div key={index} className="control">
                  <strong>{control.kind.replace(/_/g, " ")}</strong>
                  {control.threshold && (
                    <span className="control__limit">
                      {" "}
                      when {control.threshold.field} {control.threshold.operator}{" "}
                      {control.threshold.value} {control.threshold.currency ?? ""}
                    </span>
                  )}
                  <p>{control.reason}</p>
                  {control.who_approves && <p className="control__who">Approver: {control.who_approves}</p>}
                </div>
              ))}

              {assessment.blockers.map((blocker, index) => (
                <div key={index} className="blocker">
                  <strong>{blocker.kind.replace(/_/g, " ")}</strong>
                  <p>{blocker.detail}</p>
                </div>
              ))}
              </>
            )}
          </article>
        );
      })}
    </section>
  );
}
