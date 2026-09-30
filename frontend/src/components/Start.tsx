import { useRef } from "react";
import { ActionIcon, Badge, ThemeIcon } from "@mantine/core";
import {
  IconArrowUp,
  IconBolt,
  IconBook2,
  IconCreditCard,
  IconFileInvoice,
  IconPencil,
  IconScale,
  IconShieldCheck,
  IconSitemap,
  IconSparkles,
  type TablerIcon,
} from "@tabler/icons-react";

import type { Example, LibraryArticle, StepKind, Verdict } from "../types";
import { Library } from "./Library";
import { NodeCard } from "./NodeCard";

// The model needs something to work with, and the server refuses less than this.
export const SHORTEST = 20;

// A picture for each recorded example. Anything new falls back to the pencil.
const EXAMPLE_ICON: Record<string, TablerIcon> = {
  "invoice-with-approval": IconFileInvoice,
  "payment-no-approval": IconCreditCard,
};

// What using it looks like, in three steps of a few words each.
const HOW: { icon: TablerIcon; title: string; note: string }[] = [
  { icon: IconPencil, title: "Describe it", note: "In your own words" },
  { icon: IconScale, title: "See what is safe", note: "A verdict for every step" },
  { icon: IconSitemap, title: "Build it in n8n", note: "Map, checklist and workflow" },
];

// The key, drawn as the map draws it: three made-up steps, one per verdict,
// with the few words each colour stands for underneath.
const PREVIEW: { label: string; kind: StepKind; verdict: Verdict; means: string }[] = [
  { label: "Read the invoice total", kind: "extract", verdict: "fully_automatable", means: "Nobody needs to watch" },
  { label: "Pay the supplier", kind: "write", verdict: "automatable_with_control", means: "Only after a yes, or under a limit" },
  { label: "Approve anything unusual", kind: "judgement", verdict: "human_required", means: "Judgement stays with a person" },
];

interface Props {
  description: string;
  onChange: (text: string) => void;
  onSend: () => void;
  examples: Example[];
  onExample: (example: Example) => void;
  restored: boolean;
  onClearDraft: () => void;
  library: LibraryArticle[];
}

/**
 * The first screen: one question, one box, and examples to start from.
 *
 * Laid out the way every chat assistant now is, because that is a pattern
 * nobody has to be taught. Underneath, the whole idea is shown rather than
 * explained: three steps, and the key drawn as the map draws it.
 */
export function Start(props: Props) {
  const { description, onChange, onSend, examples, onExample, restored, onClearDraft, library } =
    props;
  const box = useRef<HTMLTextAreaElement>(null);
  const ready = description.trim().length >= SHORTEST;

  return (
    <main className="start">
      <div className="start__hero">
        <span className="start__eyebrow">
          <IconSparkles size={14} aria-hidden="true" />
          Plain English in, an n8n workflow out
        </span>
        <h1 className="start__title">
          What do you do <span className="start__accent">by hand?</span>
        </h1>
        <p className="start__lead">See which steps a computer can take over, and how to build it.</p>
      </div>

      <form
        className="prompt"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) onSend();
          else box.current?.focus();
        }}
      >
        <textarea
          ref={box}
          aria-label="Describe the job"
          value={description}
          placeholder="Every Friday I go through the supplier invoices in our shared inbox..."
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter alone is a new line, because a description runs to several
            // sentences. Ctrl or Cmd with it sends, as it does in most editors.
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && ready) {
              event.preventDefault();
              onSend();
            }
          }}
          rows={4}
          spellCheck
        />
        <div className="prompt__foot">
          <span className="prompt__hint">
            {restored ? (
              <>
                Picked up where you left off, kept in this browser only.{" "}
                <button type="button" className="linkish" onClick={onClearDraft}>
                  Clear it
                </button>
              </>
            ) : ready ? (
              "Ctrl + Enter to send"
            ) : (
              "A few sentences is enough"
            )}
          </span>
          <ActionIcon
            type="submit"
            size={38}
            radius="md"
            variant={ready ? "filled" : "light"}
            aria-label="Analyse this"
          >
            <IconArrowUp size={20} stroke={2.2} />
          </ActionIcon>
        </div>
      </form>

      {examples.length > 0 && (
        <div className="starters">
          <span className="starters__label">Or try one</span>
          {examples.map((example) => {
            const Pictured = EXAMPLE_ICON[example.id] ?? IconPencil;
            return (
              <button key={example.id} className="starter" onClick={() => onExample(example)}>
                <ThemeIcon size={36} radius="md" variant="light">
                  <Pictured size={20} stroke={1.8} />
                </ThemeIcon>
                <span className="starter__text">
                  <span className="starter__title">{example.label}</span>
                  {example.shows && <span className="starter__shows">{example.shows}</span>}
                </span>
                {example.replayable && (
                  <Badge
                    className="starter__tag"
                    size="sm"
                    variant="light"
                    color="runs"
                    leftSection={<IconBolt size={11} />}
                  >
                    Instant
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      )}

      <section className="explain" aria-label="How it works">
        <ol className="how">
          {HOW.map(({ icon: Pictured, title, note }, index) => (
            <li key={title} className="how__step">
              <ThemeIcon className="how__icon" size={48} radius="xl" variant="white">
                <Pictured size={22} stroke={1.8} />
              </ThemeIcon>
              <span className="how__number">{index + 1}</span>
              <strong>{title}</strong>
              <span>{note}</span>
            </li>
          ))}
        </ol>

        {/* The colours are taught here, once, by showing them on steps drawn
            exactly as the map draws them. */}
        <div className="preview" aria-label="What the colours mean">
          {PREVIEW.map((step) => (
            <figure key={step.label} className="preview__item">
              <NodeCard label={step.label} kind={step.kind} verdict={step.verdict} />
              <figcaption>{step.means}</figcaption>
            </figure>
          ))}
        </div>

        <p className="key__rule">
          <IconShieldCheck size={18} aria-hidden="true" />
          <span>
            Money, deletions and anything with legal weight never run alone. That rule is in
            the code, so the model cannot argue its way past it.
          </span>
        </p>

        {library.length > 0 && (
          <details className="library">
            <summary>
              <IconBook2 size={16} aria-hidden="true" />
              Articles it can match you to ({library.length})
            </summary>
            <p className="library__lead">
              A small written library, searched by meaning against what you type. When one is
              close enough, it appears beside your process. The model that judges your process
              never reads them.
            </p>
            <Library articles={library} />
          </details>
        )}
      </section>
    </main>
  );
}
