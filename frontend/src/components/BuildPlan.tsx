import { useEffect, useState } from "react";
import { Badge, Button, Checkbox, Progress, ThemeIcon } from "@mantine/core";
import { IconChevronDown, IconCircleCheck, IconCircleDot, IconTrophy } from "@tabler/icons-react";

import type { Task } from "../types";
import { TASK_ICON } from "./Icon";

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

  const share = (finished / Math.max(tasks.length, 1)) * 100;

  return (
    <section className="card build" id="build">
      <header className="build__head">
        <h2>Build it</h2>
        <span className="build__count">
          {finished} of {tasks.length}
        </span>
      </header>
      <Progress
        className="build__meter"
        value={share}
        size="lg"
        radius="xl"
        color={complete ? "runs" : "forest"}
        transitionDuration={300}
        aria-label="Build progress"
      />

      {complete && (
        <div className="build__ready" role="status">
          <ThemeIcon size={40} radius="xl" color="runs">
            <IconTrophy size={22} />
          </ThemeIcon>
          <div>
            <strong>Ready to build</strong>
            <span>Every item is ticked off. Switch the trigger on once the test run looks right.</span>
          </div>
        </div>
      )}

      {done.length > 0 && (
        <details className="build__export">
          <summary>
            <IconCircleCheck size={16} aria-hidden="true" />
            {done.length} {done.length === 1 ? "thing" : "things"} done by the export
            <IconChevronDown className="build__fold" size={14} aria-hidden="true" />
          </summary>
          <ul>
            {done.map((task) => {
              const Pictured = TASK_ICON[task.kind] ?? IconCircleDot;
              return (
                <li key={task.title}>
                  <Pictured size={16} aria-hidden="true" />
                  <span>
                    <strong>{task.title}.</strong> {task.detail}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <ol className="quest">
        {left.map((task) => {
          const isTicked = ticked.has(task.title);
          const isOpen = open === task.title;
          const Pictured = TASK_ICON[task.kind] ?? IconCircleDot;
          return (
            <li key={task.title} className={`quest__item ${isTicked ? "quest__item--ticked" : ""}`}>
              <Checkbox
                className="quest__tick"
                size="md"
                radius="sm"
                color="runs"
                checked={isTicked}
                onChange={() => toggle(task.title)}
                aria-label={`Done: ${task.title}`}
              />

              <ThemeIcon
                className="quest__icon"
                size={30}
                radius="md"
                variant="light"
                color={isTicked ? "gray" : task.status === "decide" ? "human" : "forest"}
              >
                <Pictured size={17} stroke={1.8} />
              </ThemeIcon>

              <div className="quest__body">
                <button
                  className="quest__title"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : task.title)}
                >
                  <span>{task.title}</span>
                  {task.status === "decide" && (
                    <Badge size="xs" variant="light" color="human">
                      Your call
                    </Badge>
                  )}
                </button>
                {isOpen && <p className="quest__detail">{task.detail}</p>}
              </div>

              {task.action === "copy" && (
                <Button size="compact-sm" variant="light" onClick={onCopy} loading={copying}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              )}
              {task.action === "questions" && (
                <Button size="compact-sm" variant="light" color="human" onClick={onQuestions}>
                  Answer
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
