import { useState } from "react";
import { Badge, Switch, ThemeIcon } from "@mantine/core";
import {
  IconArrowDown,
  IconCircleCheck,
  IconCircleDashed,
  IconClock,
  IconUser,
} from "@tabler/icons-react";

import { VERDICT_COLOR, VERDICT_LABEL } from "../labels";
import type { Blueprint, Hookup, Place } from "../types";
import { BRAND_ICON, systemIcon, VERDICT_ICON } from "./Icon";

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
        const Pictured = VERDICT_ICON[verdict];
        return (
          <li key={step.step_id} className="map__step">
            {/* The colour and the icon carry the verdict; the label is there for
                anybody who cannot see either. */}
            <ThemeIcon
              size={22}
              radius="xl"
              variant="light"
              color={VERDICT_COLOR[verdict]}
              title={VERDICT_LABEL[verdict]}
            >
              <Pictured size={13} stroke={2.2} aria-label={VERDICT_LABEL[verdict]} />
            </ThemeIcon>
            <span className="map__step-name">{step.name}</span>
            {step.gate && !asked && (
              <Badge size="sm" variant="light" color="guard" className="map__gate">
                {step.gate === "limit" && step.limit ? `waits if ${step.limit}` : "waits for a yes"}
              </Badge>
            )}
            {asked && step.gate === "limit" && step.limit && (
              <Badge size="sm" variant="light" color="guard" className="map__gate">
                only if {step.limit}
              </Badge>
            )}
            {technical && <code className="map__type">{step.node_type}</code>}
          </li>
        );
      })}
    </ul>
  );
}

function PlaceCard({ place, technical }: { place: Place; technical: boolean }) {
  const Pictured = systemIcon(place.name, place.category);
  return (
    <article className="map__card place">
      <header className="map__head">
        <ThemeIcon size={40} radius="md" variant="light" color="gray">
          <Pictured size={22} stroke={1.7} />
        </ThemeIcon>
        <div>
          <h3>{heading(place.name)}</h3>
          <span className="map__role">{CATEGORY[place.category] ?? place.category}</span>
        </div>
      </header>

      {place.steps.length > 0 ? (
        <Steps steps={place.steps} technical={technical} />
      ) : (
        <p className="map__quiet">Mentioned, but no step happens here.</p>
      )}

      <div className="place__foot">
        {place.node ? (
          <Badge variant="light" color="runs" leftSection={<IconCircleCheck size={13} />}>
            {place.node} node
          </Badge>
        ) : (
          <Badge variant="light" color="gray" leftSection={<IconCircleDashed size={13} />}>
            No node picked yet
          </Badge>
        )}
        <details className="place__how">
          <summary>How to connect</summary>
          <p>{place.setup}</p>
        </details>
      </div>
    </article>
  );
}

function Link({ label }: { label: string }) {
  return (
    <div className="map__link" aria-hidden="true">
      <span>
        <IconArrowDown size={13} />
        {label}
      </span>
    </div>
  );
}

/**
 * How the finished automation fits together: what starts it, the workflow in
 * the middle, every system it talks to, and where it comes back to a person.
 *
 * The map is the process as somebody does it today. This is the same process
 * as a builder sees it, organised by the tools rather than the order, because
 * "what do I need to connect" is the first question anybody asks once they have
 * decided to build it. Each part is labelled as what it actually is.
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
  const Mark = BRAND_ICON;
  const Runs = VERDICT_ICON.fully_automatable;
  const Waits = VERDICT_ICON.automatable_with_control;
  const Yours = VERDICT_ICON.human_required;

  return (
    <section className="connects" id="connects">
      <header className="section__head section__head--split">
        <h2>How it connects</h2>
        <Switch
          size="sm"
          label="Show n8n names"
          checked={technical}
          onChange={(event) => setTechnical(event.currentTarget.checked)}
        />
      </header>

      <div className="map">
        <article className="map__card map__card--narrow map__card--start">
          <header className="map__head">
            <ThemeIcon size={40} radius="md" variant="light" color="forest">
              <IconClock size={22} stroke={1.7} />
            </ThemeIcon>
            <div>
              <h3>{blueprint.trigger_node}</h3>
              <span className="map__role">What starts it</span>
            </div>
          </header>
          <p className="map__quote">&ldquo;{blueprint.trigger}&rdquo;</p>
          {blueprint.watches && (
            <Badge variant="default" className="map__watch">
              Watching: {blueprint.watches}
            </Badge>
          )}
          {technical && <code className="map__type">{blueprint.trigger_type}</code>}
        </article>

        <Link label="then" />

        <article className="map__card map__card--narrow map__card--hub">
          <header className="map__head">
            <ThemeIcon size={40} radius="md" variant="gradient" gradient={{ from: "forest.7", to: "runs.7", deg: 135 }}>
              <Mark size={22} stroke={1.8} />
            </ThemeIcon>
            <div>
              <h3>An n8n workflow</h3>
              <span className="map__role">The automation</span>
            </div>
          </header>
          <div className="map__counts">
            <Badge size="lg" variant="light" color="runs" leftSection={<Runs size={14} />}>
              {runs} on {runs === 1 ? "its" : "their"} own
            </Badge>
            <Badge size="lg" variant="light" color="guard" leftSection={<Waits size={14} />}>
              {waits} {waits === 1 ? "waits" : "wait"} for a yes
            </Badge>
            <Badge size="lg" variant="light" color="human" leftSection={<Yours size={14} />}>
              {yours} with you
            </Badge>
          </div>
          {automated.length > 0 && (
            <>
              <p className="map__sub">Done inside the workflow</p>
              <Steps steps={automated} technical={technical} />
            </>
          )}
        </article>

        <Link label="talks to" />

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

        <Link label="comes back to" />

        <article className="map__card map__card--narrow map__card--you">
          <header className="map__head">
            <ThemeIcon size={40} radius="md" variant="light" color="human">
              <IconUser size={22} stroke={1.7} />
            </ThemeIcon>
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
