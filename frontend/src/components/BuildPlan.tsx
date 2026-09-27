import { useEffect, useState } from "react";

import type { Task } from "../types";
import { Icon } from "./Icon";

interface Props {
  tasks: Task[];
  /** Copies the workflow, as the button at the top of the page does. */
  onCopy: () => void;
  copying: boolean;
  copied: boolean;
  /** Takes the reader to the questions, which live in the conversation. */
  onQuestions: () => void;
  /** Which analysis these ticks belong to, so they come back with it. */
  saveAs: string;
  /** How many are still unticked, for the count on the tab. */
  onLeft?: (left: number) => void;
}

const PREFIX = "aa-build:";

// Ticks are a convenience kept in this browser. Storage can be refused or
// cleared at any time, so a failure means starting with nothing ticked.
function load(key: string): Set<string> {
  try {
    const saved = window.localStorage.getItem(PREFIX + key);
    return new Set(saved ? (JSON.parse(saved) as string[]) : []);
  } catch {
    return new Set();
  }
}

function save(key: string, ticked: Set<string>) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify([...ticked]));
  } catch {
    // Nothing to do: the ticks still work for as long as the page is open.
  }
}

/**
 * What is left to build, as a list to tick off.
 *
 * Everything the export already did folds into one line, because knowing it is
 * done matters more than reading it. What is left is one line each, with the
 * detail a tap away, a box to tick, and a bar that fills as it goes. Ticking
 * is the reader's own record; the page only ticks the one thing it can see
 * being done, the copy.
 */
export function BuildPlan({ tasks, onCopy, copying, copied, onQuestions, saveAs, onLeft }: Props) {
  const done = tasks.filter((t) => t.status === "done");
  const left = tasks.filter((t) => t.status !== "done");
  const copyTask = left.find((t) => t.action === "copy")?.title;

  const [ticked, setTicked] = useState<Set<string>>(() => load(saveAs));
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => save(saveAs, ticked), [saveAs, ticked]);

  useEffect(() => {
    if (copied && copyTask) setTicked((current) => new Set(current).add(copyTask));
  }, [copied, copyTask]);

  function toggle(title: string) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  const finished = done.length + left.filter((t) => ticked.has(t.title)).length;
  const complete = left.length > 0 && left.every((t) => ticked.has(t.title));

  useEffect(() => onLeft?.(tasks.length - finished), [onLeft, tasks.length, finished]);

  return (
    <section className="card build" id="build">
      <header className="build__head">
        <h2>Build it</h2>
        <span className="build__count">
          {finished} of {tasks.length}
        </span>
      </header>
      <div
        className="meter"
        role="progressbar"
        aria-label="Build progress"
        aria-valuemin={0}
        aria-valuemax={tasks.length}
        aria-valuenow={finished}
      >
        <span style={{ width: `${(finished / Math.max(tasks.length, 1)) * 100}%` }} />
      </div>

      {complete && (
        <div className="build__ready" role="status">
          <Icon name="trophy" size={22} />
          <div>
            <strong>Ready to build</strong>
            <span>Every item is ticked off. Switch the trigger on once the test run looks right.</span>
          </div>
        </div>
      )}

      {done.length > 0 && (
        <details className="build__export">
          <summary>
            <Icon name="check" size={14} />
            {done.length} {done.length === 1 ? "thing" : "things"} done by the export
          </summary>
          <ul>
            {done.map((task) => (
              <li key={task.title}>
                <strong>{task.title}.</strong> {task.detail}
              </li>
            ))}
          </ul>
        </details>
      )}

      <ol className="quest">
        {left.map((task) => {
          const isTicked = ticked.has(task.title);
          const isOpen = open === task.title;
          return (
            <li key={task.title} className={`quest__item ${isTicked ? "quest__item--ticked" : ""}`}>
              <button
                className="quest__tick"
                role="checkbox"
                aria-checked={isTicked}
                aria-label={`Done: ${task.title}`}
                onClick={() => toggle(task.title)}
              >
                {isTicked && <Icon name="check" size={14} />}
              </button>

              <div className="quest__body">
                <button
                  className="quest__title"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : task.title)}
                >
                  <span>{task.title}</span>
                  {task.status === "decide" && <span className="quest__call">Your call</span>}
                </button>
                {isOpen && <p className="quest__detail">{task.detail}</p>}
              </div>

              {task.action === "copy" && (
                <button className="secondary quest__action" onClick={onCopy} disabled={copying}>
                  {copying ? "Building..." : copied ? "Copied" : "Copy"}
                </button>
              )}
              {task.action === "questions" && (
                <button className="secondary quest__action" onClick={onQuestions}>
                  Answer
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
