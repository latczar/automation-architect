import { useRef } from "react";

import { VERDICT_LABEL } from "../labels";
import type { Example, LibraryArticle } from "../types";
import { Library } from "./Library";

// The model needs something to work with, and the server refuses less than this.
export const SHORTEST = 20;

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
 * nobody has to be taught. Everything else it could say waits underneath, for
 * the people who want to know what they are about to get before they type.
 */
export function Start(props: Props) {
  const { description, onChange, onSend, examples, onExample, restored, onClearDraft, library } =
    props;
  const box = useRef<HTMLTextAreaElement>(null);
  const ready = description.trim().length >= SHORTEST;

  return (
    <main className="start">
      <h1 className="start__title">What do you do by hand?</h1>
      <p className="start__lead">
        Describe a job and see which steps are safe to hand over, how it would
        connect to your tools, and how to build it.
      </p>

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
          <button className="prompt__send" type="submit" aria-label="Analyse this">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M12 19V5 M6 11l6-6 6 6" />
            </svg>
          </button>
        </div>
      </form>

      {examples.length > 0 && (
        <div className="starters">
          {examples.map((example) => (
            <button key={example.id} className="starter" onClick={() => onExample(example)}>
              <span className="starter__title">{example.label}</span>
              {example.shows && <span className="starter__shows">{example.shows}</span>}
              <span className="starter__tag">
                {example.replayable ? "Example, runs instantly" : "Example"}
              </span>
            </button>
          ))}
          <button className="starter starter--own" onClick={() => box.current?.focus()}>
            <span className="starter__title">Describe your own</span>
            <span className="starter__shows">Something repetitive, in your own words.</span>
            <span className="starter__tag">Your own</span>
          </button>
        </div>
      )}

      <section className="explain" aria-label="How it works">
        <ol className="how">
          <li>
            <strong>Describe a job you do by hand</strong>
            <span>The way you would explain it to a colleague.</span>
          </li>
          <li>
            <strong>See which steps are safe to hand over</strong>
            <span>Each one comes back as one of the three below, with its reasons.</span>
          </li>
          <li>
            <strong>Take away a plan to build it</strong>
            <span>A map of the tools, a checklist, and a workflow for n8n.</span>
          </li>
        </ol>

        {/* The colours are taught here, once, so the map can use them without
            explaining itself every time. */}
        <ul className="key">
          <li className="key__item key__item--fully_automatable">
            <strong>{VERDICT_LABEL.fully_automatable}</strong>
            <span>A computer can do it with nobody watching.</span>
          </li>
          <li className="key__item key__item--automatable_with_control">
            <strong>{VERDICT_LABEL.automatable_with_control}</strong>
            <span>A computer can do it, once a person signs off or a limit applies.</span>
          </li>
          <li className="key__item key__item--human_required">
            <strong>{VERDICT_LABEL.human_required}</strong>
            <span>Judgement that should not be handed over.</span>
          </li>
        </ul>

        <p className="key__rule">
          A step that moves money, cannot be undone or carries legal weight never comes
          back as &ldquo;runs itself&rdquo;. That rule is in the code, so the model cannot
          argue its way past it.
        </p>

        {library.length > 0 && (
          <details className="library">
            <summary>Articles it can match you to ({library.length})</summary>
            <p className="library__lead">
              A small written library, searched by meaning against what you type. When
              one is close enough, it appears beside your process. They are shown to
              you, not fed to the model that judges your process.
            </p>
            <Library articles={library} />
          </details>
        )}
      </section>
    </main>
  );
}
