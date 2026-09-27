import type { Task } from "../types";

const STATUS: Record<Task["status"], string> = {
  done: "Done for you",
  todo: "To do",
  decide: "Your call",
};

interface Props {
  tasks: Task[];
  /** Copies the workflow, as the button at the top of the page does. */
  onCopy: () => void;
  copying: boolean;
  copied: boolean;
  /** Takes the reader to the questions, which live in the conversation. */
  onQuestions: () => void;
}

/**
 * What the export has already done, and what is left, as a list to work down.
 *
 * A task list rather than a paragraph, after the pattern government services
 * use for long forms: each line is one thing, says whether it is finished, and
 * the finished ones come first so the rest looks like a short list rather than
 * a project. "Your call" is kept apart from "to do" because a decision cannot
 * be delegated to whoever happens to be doing the typing.
 */
export function BuildPlan({ tasks, onCopy, copying, copied, onQuestions }: Props) {
  const done = tasks.filter((t) => t.status === "done").length;
  const left = tasks.length - done;

  return (
    <section className="card build" id="build">
      <h2>Build it</h2>
      <p className="build__lead">
        {done} {done === 1 ? "thing is" : "things are"} already done by the export,
        and {left} {left === 1 ? "is" : "are"} left. Work down the list.
      </p>

      <ol className="tasks">
        {tasks.map((task, index) => (
          <li key={index} className={`task task--${task.status}`}>
            <span className="task__status">{STATUS[task.status]}</span>
            <div className="task__body">
              <p className="task__title">{task.title}</p>
              <p className="task__detail">{task.detail}</p>
              {task.action === "copy" && (
                <button className="secondary task__action" onClick={onCopy} disabled={copying}>
                  {copying ? "Building..." : copied ? "Copied" : "Copy for n8n"}
                </button>
              )}
              {task.action === "questions" && (
                <button className="linkish task__link" onClick={onQuestions}>
                  Go to the questions
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
