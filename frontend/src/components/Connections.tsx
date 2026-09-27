import { useState } from "react";

import { VERDICT_LABEL } from "../labels";
import type { Blueprint, Hookup, Place } from "../types";

const CATEGORY: Record<string, string> = {
  email: "Email",
  spreadsheet: "Spreadsheet",
  database: "Database",
  crm: "CRM",
  chat: "Chat",
  calendar: "Calendar",
  file_storage: "File storage",
  accounting: "Accounting",
  forms: "Forms",
  website: "Website",
  phone_or_sms: "Phone or text",
  payments: "Payments",
  internal_tool: "Internal tool",
  paper_or_offline: "Paper or offline",
  other: "Other",
};

// One small outline icon per kind of thing, so a system can be told apart at a
// glance before its name is read. Drawn on a 24 unit grid in the text colour.
const ICON: Record<string, string> = {
  email: "M3 6h18v12H3z M3 7l9 6 9-6",
  spreadsheet: "M4 4h16v16H4z M4 10h16 M4 15h16 M10 4v16",
  database: "M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6 M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3",
  crm: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5 M16 5a3 3 0 0 1 0 6 M18 15c2 .6 3 2.3 3 5",
  chat: "M4 5h16v11H9l-5 4z",
  calendar: "M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5",
  file_storage: "M3 7h7l2 2h9v10H3z",
  accounting: "M5 3h14v18H5z M8 7h8 M8 11h2 M14 11h2 M8 15h2 M14 15h2",
  forms: "M6 4h12v17H6z M9 4V2h6v2 M9 10h6 M9 14h6",
  website: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  phone_or_sms: "M7 3h10v18H7z M11 18h2",
  payments: "M3 6h18v12H3z M3 10h18 M7 15h4",
  paper_or_offline: "M6 3h9l3 3v15H6z M9 10h6 M9 14h6 M9 18h4",
  internal_tool: "M4 7l8-4 8 4-8 4z M4 7v10l8 4 8-4V7 M12 11v10",
  other: "M4 7l8-4 8 4-8 4z M4 7v10l8 4 8-4V7 M12 11v10",
  trigger: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  workflow: "M5 5h5v5H5z M14 14h5v5h-5z M10 7.5h4a2 2 0 0 1 2 2V14",
  person: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5",
};

function Icon({ name }: { name: string }) {
  return (
    <span className="map__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d={ICON[name] ?? ICON.other} />
      </svg>
    </span>
  );
}

/** "shared inbox" as a heading reads better as "Shared inbox". */
function heading(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

interface StepsProps {
  steps: Hookup[];
  technical: boolean;
  /** Under "says yes before these run" the pause goes without saying; only a limit is news. */
  asked?: boolean;
}

function Steps({ steps, technical, asked = false }: StepsProps) {
  return (
    <ul className="map__steps">
      {steps.map((step) => {
        const verdict = step.verdict ?? "needs_more_info";
        return (
          <li key={step.step_id} className="map__step">
            <span className={`map__pill map__pill--${verdict}`}>{VERDICT_LABEL[verdict]}</span>
            <span className="map__step-name">{step.name}</span>
            {step.gate && !asked && (
              <span className="map__gate">
                {step.gate === "limit" && step.limit
                  ? `waits for a yes if ${step.limit}`
                  : "waits for a yes"}
              </span>
            )}
            {asked && step.gate === "limit" && step.limit && (
              <span className="map__gate">only if {step.limit}</span>
            )}
            {technical && <code className="map__type">{step.node_type}</code>}
          </li>
        );
      })}
    </ul>
  );
}

function PlaceCard({ place, technical }: { place: Place; technical: boolean }) {
  return (
    <article className="map__card place">
      <header className="map__head">
        <Icon name={place.category} />
        <div>
          <h3>{heading(place.name)}</h3>
          <span className="map__role">System &middot; {CATEGORY[place.category] ?? place.category}</span>
        </div>
      </header>

      {place.steps.length > 0 ? (
        <Steps steps={place.steps} technical={technical} />
      ) : (
        <p className="map__quiet">Mentioned, but no step happens here.</p>
      )}

      <p className={`place__node ${place.node ? "place__node--ready" : ""}`}>
        {place.node ? `Ready-made node: ${place.node}` : "No node picked yet"}
      </p>
      <p className="place__setup">{place.setup}</p>
    </article>
  );
}

/**
 * How the finished automation fits together: what starts it, the workflow in
 * the middle, every system it talks to, and where it comes back to a person.
 *
 * The diagram above is the process as somebody does it today. This is the same
 * process as a builder sees it, organised by the tools rather than the order,
 * because "what do I need to connect" is the first question anybody asks once
 * they have decided to build it. Each part is labelled as what it actually is.
 */
export function Connections({ blueprint }: { blueprint: Blueprint }) {
  // Plain words for everybody, the names n8n itself uses for anybody who
  // wants them. Off by default: most readers want the map, not the machinery.
  const [technical, setTechnical] = useState(false);

  const every = [...blueprint.inside, ...blueprint.places.flatMap((p) => p.steps)];
  const runs = every.filter((s) => s.verdict === "fully_automatable").length;
  const waits = blueprint.approvals.length;
  const yours = blueprint.with_you.length;
  const nothingForYou = !waits && !yours && !blueprint.unclear.length;
  // A step a person does has no system and so sits "inside" by elimination,
  // but it is not the workflow doing it. It is listed under You instead.
  const automated = blueprint.inside.filter((s) => s.verdict !== "human_required");

  return (
    <section className="connects" id="connects">
      <header className="section__head section__head--split">
        <div>
          <h2>How it connects</h2>
          <p>
            What starts it, the workflow in the middle, each system it talks to, and
            where it comes back to you.
          </p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={technical}
            onChange={(event) => setTechnical(event.target.checked)}
          />
          <span>Show n8n names</span>
        </label>
      </header>

      <div className="map">
        <article className="map__card map__card--narrow">
          <header className="map__head">
            <Icon name="trigger" />
            <div>
              <h3>{blueprint.trigger_node}</h3>
              <span className="map__role">What starts it</span>
            </div>
          </header>
          <p className="map__quote">&ldquo;{blueprint.trigger}&rdquo;</p>
          {blueprint.watches && <p className="map__quiet">Watching: {blueprint.watches}</p>}
          {technical && <code className="map__type">{blueprint.trigger_type}</code>}
        </article>

        <div className="map__link" aria-hidden="true">
          <span>then</span>
        </div>

        <article className="map__card map__card--narrow map__card--hub">
          <header className="map__head">
            <Icon name="workflow" />
            <div>
              <h3>An n8n workflow</h3>
              <span className="map__role">The automation</span>
            </div>
          </header>
          <p className="map__counts">
            <strong>{runs}</strong> {runs === 1 ? "step runs on its own" : "steps run on their own"},{" "}
            <strong>{waits}</strong> {waits === 1 ? "waits" : "wait"} for a yes,{" "}
            <strong>{yours}</strong> {yours === 1 ? "stays" : "stay"} with you.
          </p>
          {automated.length > 0 && (
            <>
              <p className="map__sub">Done inside the workflow, with no outside system</p>
              <Steps steps={automated} technical={technical} />
            </>
          )}
        </article>

        <div className="map__link" aria-hidden="true">
          <span>talks to</span>
        </div>

        <div className="map__lane">
          <span className="map__lane-label">
            The systems it touches ({blueprint.places.length})
          </span>
          {blueprint.places.length > 0 ? (
            <div className="map__places">
              {blueprint.places.map((place) => (
                <PlaceCard key={place.id} place={place} technical={technical} />
              ))}
            </div>
          ) : (
            <p className="map__quiet">
              You did not name any systems, so every step sits inside the workflow
              until you say where it happens.
            </p>
          )}
        </div>

        <div className="map__link" aria-hidden="true">
          <span>comes back to</span>
        </div>

        <article className="map__card map__card--narrow map__card--you">
          <header className="map__head">
            <Icon name="person" />
            <div>
              <h3>You</h3>
              <span className="map__role">Person</span>
            </div>
          </header>
          {nothingForYou ? (
            <p className="map__quiet">Nothing waits for you. Every step runs on its own.</p>
          ) : (
            <>
              {waits > 0 && (
                <>
                  <p className="map__sub">Says yes before these run</p>
                  <Steps steps={blueprint.approvals} technical={false} asked />
                </>
              )}
              {yours > 0 && (
                <>
                  <p className="map__sub">Does these yourself</p>
                  <Steps steps={blueprint.with_you} technical={false} />
                </>
              )}
              {blueprint.unclear.length > 0 && (
                <>
                  <p className="map__sub">Still to be worked out</p>
                  <Steps steps={blueprint.unclear} technical={false} />
                </>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
