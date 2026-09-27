import type { Question } from "../types";
import { Icon } from "./Icon";

interface Props {
  questions: Question[];
  /** A shared analysis is read, not answered, so it gets no controls. */
  readOnly: boolean;
  answers: Record<string, string>;
  onAnswer: (question: string, answer: string) => void;
  /** How many answers are ready to send. */
  given: number;
  busy: boolean;
  onRun: () => void;
}

/**
 * What it could not tell from the description, answered with a tap.
 *
 * The suggested answers lead and the reasoning waits behind "Why ask?",
 * because most people can answer a question faster than they can read why it
 * was asked. The count at the top says how close the map is to sharp.
 */
export function Questions({ questions, readOnly, answers, onAnswer, given, busy, onRun }: Props) {
  const answered = questions.filter((q) => (answers[q.question] ?? "").trim()).length;

  return (
    <section className="card questions" id="questions">
      <header className="questions__head">
        <h3>Sharpen the map</h3>
        {!readOnly && (
          <span className="questions__count">
            {answered} of {questions.length} answered
          </span>
        )}
      </header>
      {!readOnly && (
        <div className="dots" aria-hidden="true">
          {questions.map((q) => (
            <span
              key={q.id}
              className={`dots__dot ${(answers[q.question] ?? "").trim() ? "dots__dot--done" : ""}`}
            />
          ))}
        </div>
      )}

      <div className="questions__list">
        {questions.map((question) => {
          const mine = answers[question.question] ?? "";
          const picked = question.suggested_answers.includes(mine);
          return (
            <div key={question.id} className={`question ${mine.trim() ? "question--answered" : ""}`}>
              <p className="question__text">
                {mine.trim() && <Icon name="check" size={14} />}
                {question.question}
                {/* Said out loud, like the overrides. A question the model never
                    asked should not pass itself off as one it did. */}
                {question.added_by_us && <span className="question__ours">From our checks</span>}
              </p>

              {question.suggested_answers.length > 0 && (
                <div className="question__answers">
                  {question.suggested_answers.map((answer, i) =>
                    readOnly ? (
                      <span key={i} className="question__suggestion">
                        {answer}
                      </span>
                    ) : (
                      <button
                        key={i}
                        type="button"
                        className={`question__suggestion question__suggestion--pick ${
                          mine === answer ? "question__suggestion--chosen" : ""
                        }`}
                        aria-pressed={mine === answer}
                        onClick={() => onAnswer(question.question, mine === answer ? "" : answer)}
                      >
                        {answer}
                      </button>
                    ),
                  )}
                </div>
              )}

              {!readOnly && (
                <input
                  className="question__input"
                  value={picked ? "" : mine}
                  placeholder="Or type your own"
                  aria-label={`Your answer: ${question.question}`}
                  onChange={(event) => onAnswer(question.question, event.target.value)}
                />
              )}

              <details className="question__why">
                <summary>Why ask?</summary>
                <p>{question.why_it_matters}</p>
              </details>
            </div>
          );
        })}
      </div>

      {!readOnly && given > 0 && (
        <button className="questions__again" onClick={onRun} disabled={busy}>
          {busy
            ? "Redrawing..."
            : `Redraw the map with ${given} ${given === 1 ? "answer" : "answers"}`}
        </button>
      )}
    </section>
  );
}
