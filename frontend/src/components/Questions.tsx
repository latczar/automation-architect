import { ActionIcon, Badge, Button, Chip, TextInput, Tooltip } from "@mantine/core";
import {
  IconCircleCheckFilled,
  IconCircleDashed,
  IconInfoCircle,
  IconRefresh,
  IconShieldCheck,
} from "@tabler/icons-react";

import type { Question } from "../types";

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
 * The suggested answers lead and the reasoning waits behind the info icon,
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
          const done = Boolean(mine.trim());
          return (
            <div key={question.id} className={`question ${done ? "question--answered" : ""}`}>
              <div className="question__text">
                <span className="question__state" aria-hidden="true">
                  {done ? <IconCircleCheckFilled size={18} /> : <IconCircleDashed size={18} />}
                </span>
                <p>{question.question}</p>
                <Tooltip
                  label={question.why_it_matters}
                  events={{ hover: true, focus: true, touch: true }}
                  position="top-end"
                >
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    radius="xl"
                    aria-label={`Why ask: ${question.why_it_matters}`}
                  >
                    <IconInfoCircle size={16} />
                  </ActionIcon>
                </Tooltip>
              </div>

              {/* Said out loud, like the overrides. A question the model never
                  asked should not pass itself off as one it did. */}
              {question.added_by_us && (
                <Badge
                  className="question__ours"
                  size="xs"
                  variant="outline"
                  leftSection={<IconShieldCheck size={11} />}
                >
                  From our checks
                </Badge>
              )}

              {question.suggested_answers.length > 0 && (
                <div className="question__answers">
                  {question.suggested_answers.map((answer, i) =>
                    readOnly ? (
                      <span key={i} className="question__suggestion">
                        {answer}
                      </span>
                    ) : (
                      <Chip
                        key={i}
                        size="sm"
                        variant="outline"
                        checked={mine === answer}
                        onChange={() => onAnswer(question.question, mine === answer ? "" : answer)}
                      >
                        {answer}
                      </Chip>
                    ),
                  )}
                </div>
              )}

              {!readOnly && (
                <TextInput
                  className="question__input"
                  size="sm"
                  value={picked ? "" : mine}
                  placeholder="Or type your own"
                  aria-label={`Your answer: ${question.question}`}
                  onChange={(event) => onAnswer(question.question, event.currentTarget.value)}
                />
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && given > 0 && (
        <Button
          className="questions__again"
          fullWidth
          leftSection={<IconRefresh size={16} />}
          onClick={onRun}
          loading={busy}
        >
          Redraw the map with {given} {given === 1 ? "answer" : "answers"}
        </Button>
      )}
    </section>
  );
}
