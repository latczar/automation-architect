import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ActionIcon, Button, Loader } from "@mantine/core";
import { IconAlertTriangle, IconArrowRight, IconArrowUp, IconLink } from "@tabler/icons-react";

import { BRAND_ICON } from "./Icon";
import type { AnalyseResponse, Answer, Attempt, SharedAnalysis } from "../types";
import { Overview } from "./Overview";
import { Questions } from "./Questions";

/** One exchange: what the person sent, and how the reply to it ended. */
export interface Round {
  kind: "description" | "answers" | "detail";
  text: string;
  answers: Answer[];
  // One line once it has finished, for when a later round pushes it up the
  // conversation and only a summary of it is still worth the space.
  outcome: string | null;
  failed: boolean;
}

const WORKING: Record<Round["kind"], string> = {
  description: "Working through your process",
  answers: "Redrawing the map with your answers",
  detail: "Working it out again with what you added",
};

interface Props {
  rounds: Round[];
  busy: boolean;
  elapsed: number;
  error: string | null;
  result: AnalyseResponse | null;
  /** The article card, or the card saying there is none, or nothing. */
  article: ReactNode;
  shared: SharedAnalysis | null;
  answers: Record<string, string>;
  onAnswer: (question: string, answer: string) => void;
  given: number;
  onRedraw: () => void;
  onDetail: (text: string) => void;
  onPick: (stepId: string) => void;
  /** On a phone, where only one side shows at a time. */
  onShowBlueprint: () => void;
}

/**
 * The conversation: what was described, what came back, and what it still
 * needs to know.
 *
 * The questions used to be a form at the foot of a long page. Here they are
 * part of the reply that raised them, answered where they were asked, and each
 * answer comes back as a new reply rather than the page quietly changing.
 */
export function Chat(props: Props) {
  const { rounds, busy, result, shared } = props;
  const latest = useRef<HTMLDivElement>(null);

  // A new round, or the one in progress finishing, brings the latest exchange
  // to the top of the column, where its reply starts.
  useEffect(() => {
    latest.current?.scrollIntoView({ block: "start" });
  }, [rounds.length, busy]);

  return (
    <section className="chat" aria-label="Conversation">
      <div className="chat__scroll">
        {shared && (
          <p className="chat__shared">
            <IconLink size={16} aria-hidden="true" />
            <strong>A shared analysis.</strong> Created on{" "}
            {new Date(shared.created_at).toLocaleDateString("en-GB")}, and the link stops
            working on {new Date(shared.expires_at).toLocaleDateString("en-GB")}.
          </p>
        )}

        {rounds.map((round, index) => {
          const last = index === rounds.length - 1;
          return (
            <Fragment key={index}>
              <div ref={last ? latest : undefined} className="chat__anchor" />
              <You round={round} />
              {last ? <Reply {...props} kind={round.kind} /> : <Past round={round} />}
            </Fragment>
          );
        })}

        {shared && rounds.length === 0 && <Reply {...props} kind="description" />}
      </div>

      {!shared && result?.graph && <Detail busy={busy} onSend={props.onDetail} />}
    </section>
  );
}

// Longer than this and the first message pushes the reply off the screen, so
// it folds to a few lines until somebody asks to see the rest.
const FOLD_AT = 240;

function You({ round }: { round: Round }) {
  const long = round.kind !== "answers" && round.text.length > FOLD_AT;
  const [open, setOpen] = useState(false);

  return (
    <div className={`you ${long && !open ? "you--folded" : ""}`}>
      {round.kind === "answers" ? (
        <>
          <span className="you__label">Answers</span>
          <ul>
            {round.answers.map((given) => (
              <li key={given.question}>
                <span className="you__question">{given.question}</span>
                {given.answer}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{round.text}</p>
      )}
      {long && (
        <button className="you__more" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Show less" : "Show all"}
        </button>
      )}
    </div>
  );
}

/** Who is talking: the mark, then the name, as a chat app labels a reply. */
function Who() {
  const Mark = BRAND_ICON;
  return (
    <span className="reply__who">
      <span className="reply__mark" aria-hidden="true">
        <Mark size={12} stroke={2.2} />
      </span>
      Automation Architect
    </span>
  );
}

function Past({ round }: { round: Round }) {
  return (
    <div className={`reply reply--past ${round.failed ? "reply--failed" : ""}`}>
      <Who />
      <p>{round.outcome ?? "Stopped before it finished."}</p>
    </div>
  );
}

function Reply(props: Props & { kind: Round["kind"] }) {
  const { busy, elapsed, error, result, article, shared, kind } = props;
  const attempts: Attempt[] = result
    ? [...result.extraction_attempts, ...result.assessment_attempts]
    : [];
  const repairs = attempts.filter((a) => !a.ok);
  const graph = result?.graph;

  return (
    <article className="reply">
      <Who />

      {/* Ten to twenty seconds is a long time to look at nothing. This says what
          is happening, how long it usually takes and how long it has been. */}
      {busy && (
        <div className="working" role="status">
          <div className="working__bar" aria-hidden="true">
            <span />
          </div>
          <p className="working__title">
            <Loader size="xs" type="dots" aria-hidden="true" />
            {WORKING[kind]}
            {elapsed > 0 && (
              <span className="working__clock" aria-hidden="true">
                {elapsed}s
              </span>
            )}
          </p>
          <p className="working__note">
            {elapsed < 30
              ? "It maps the steps, judges each one, then our checks go over every verdict. Usually 10 to 20 seconds."
              : "Taking longer than usual. If it runs out of time it stops and says so, rather than leaving you waiting."}
          </p>
        </div>
      )}

      {!busy && error && (
        <p className="reply__error">
          <IconAlertTriangle size={18} aria-hidden="true" />
          {error}
          {graph && " The map beside this is from the last answer that worked."}
        </p>
      )}

      {!busy && graph && result?.plan && (
        <Overview graph={graph} plan={result.plan} onPick={props.onPick} />
      )}

      {/* One step is what comes back when the description names a wish rather
          than a process ("automate our payroll"). Saying so beats a map of one. */}
      {!busy && graph && graph.steps.length <= 1 && !shared && (
        <p className="reply__hint">
          Only one step came out of that. Say what you actually do, step by step, in the
          box below, and it can map it properly.
        </p>
      )}

      {!busy && graph && !result?.plan && (
        <p className="muted">The process was mapped, but the judgement stage did not complete.</p>
      )}

      {/* It arrives in about a second, so it shows while the rest is working. */}
      {article}

      {!busy && repairs.length > 0 && (
        <details className="repairs">
          <summary>
            The checker rejected {repairs.length} {repairs.length === 1 ? "answer" : "answers"}{" "}
            and asked again
          </summary>
          {repairs.map((attempt, index) => (
            <div key={index}>
              <strong>Attempt {attempt.number}</strong>
              <ul>
                {attempt.errors.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}

      {!busy && graph && (
        <Button
          className="reply__see"
          variant="light"
          fullWidth
          rightSection={<IconArrowRight size={16} />}
          onClick={props.onShowBlueprint}
        >
          See the map and the build plan
        </Button>
      )}

      {!busy && graph && graph.questions.length > 0 && (
        <Questions
          questions={graph.questions}
          readOnly={Boolean(shared)}
          answers={props.answers}
          onAnswer={props.onAnswer}
          given={props.given}
          busy={busy}
          onRun={props.onRedraw}
        />
      )}

      {!busy && result && result.model !== "none" && (
        <p className="reply__meta">{answeredBy(result.model)}</p>
      )}
    </article>
  );
}

/** A box for adding what the description left out, and mapping it again. */
function Detail({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0 && !busy;

  function send() {
    if (!ready) return;
    onSend(text);
    setText("");
  }

  return (
    <form
      className="detail"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <textarea
        aria-label="Add a detail"
        value={text}
        placeholder="Add a detail, like: we use Gmail, and the spreadsheet is a Google Sheet"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        rows={2}
      />
      <div className="detail__foot">
        <span className="detail__hint">Added to your description, then mapped again</span>
        <ActionIcon
          type="submit"
          size={32}
          radius="md"
          variant={ready ? "filled" : "light"}
          aria-label="Add and map again"
          disabled={busy}
        >
          <IconArrowUp size={17} stroke={2.2} />
        </ActionIcon>
      </div>
    </form>
  );
}

/**
 * Who produced the analysis, in words a reader would use.
 *
 * The server names its clients for developers: "recording(gemini:gemini-3.5-
 * flash-lite)" means the local wrapper that saves each response, around the
 * Gemini client, around a model id. A reader wants "Gemini 3.5 Flash-Lite".
 */
export function answeredBy(model: string): string {
  if (model === "a shared link") return "Opened from a shared link.";

  const inner = model.replace(/^recording\((.*)\)$/, "$1");
  if (inner.startsWith("replay:")) return "Answered by a recorded example, not a live model.";

  if (inner.startsWith("gemini:")) {
    const name = inner
      .slice("gemini:".length)
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
      .replace(" Flash Lite", " Flash-Lite");
    return `Answered by ${name}.`;
  }

  return `Answered by ${inner}.`;
}
