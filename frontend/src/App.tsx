import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ActionIcon, Button } from "@mantine/core";
import { IconBrandGithub, IconPlus } from "@tabler/icons-react";

import {
  analyse,
  buildWorkflow,
  copyToClipboard,
  createShare,
  download,
  fetchBlueprint,
  fetchExamples,
  fetchLibrary,
  fetchPlaybook,
  fetchShare,
  shareIdFromUrl,
} from "./api";
import type { Tab } from "./components/Canvas";
import { Chat, type Round } from "./components/Chat";
import { BRAND_ICON } from "./components/Icon";
import { NoPlaybook } from "./components/Library";
import { Playbook } from "./components/Playbook";
import { SHORTEST, Start } from "./components/Start";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import type {
  AnalyseResponse,
  Answer,
  Blueprint,
  EffortInput,
  Example,
  LibraryArticle,
  PlaybookResponse,
  SharedAnalysis,
} from "./types";

/** The server caps these too. Slicing here keeps a 422 off the screen. */
const MOST_ANSWERS = 12;

const SOURCE = "https://github.com/latczar/automation-architect";

// The blueprint brings the diagram library with it, which is most of the
// JavaScript on the page. Nobody needs it on the first screen, so it loads
// while the first answer is being worked out.
const loadCanvas = () => import("./components/Canvas");
const Canvas = lazy(() => loadCanvas().then((m) => ({ default: m.Canvas })));

/** The mark and the name, which is also the way back to the start. */
function Brand({ onClick }: { onClick?: () => void }) {
  const Mark = BRAND_ICON;
  const inner = (
    <>
      <span className="brand__mark" aria-hidden="true">
        <Mark size={16} stroke={2} />
      </span>
      <span className="brand__name">Automation Architect</span>
    </>
  );
  return onClick ? (
    <button className="brand brand--home" onClick={onClick} title="Start again">
      {inner}
    </button>
  ) : (
    <span className="brand">{inner}</span>
  );
}

function Source() {
  return (
    <ActionIcon
      component="a"
      href={SOURCE}
      variant="subtle"
      color="gray"
      size="lg"
      aria-label="Source on GitHub"
      title="Source on GitHub"
    >
      <IconBrandGithub size={20} stroke={1.7} />
    </ActionIcon>
  );
}

/**
 * Two screens. Before anything is sent, a single question and a box. After,
 * a workbench: the conversation on one side and the blueprint on the other,
 * after the chat-and-canvas layout the current assistants have settled on.
 */
export default function App() {
  const [description, setDescription] = useState("");
  const [examples, setExamples] = useState<Example[]>([]);
  const [replayCase, setReplayCase] = useState<string | undefined>();
  const [rounds, setRounds] = useState<Round[]>([]);

  // The last analysis that produced a map. Kept while a new one is worked out,
  // so the blueprint has something to show, and kept if the new one fails.
  const [result, setResult] = useState<AnalyseResponse | null>(null);
  // Bumped with every new result, so the blueprint starts fresh for it: the
  // step ids change, and minutes typed against the old ones mean nothing.
  const [version, setVersion] = useState(0);

  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("map");
  // A phone shows one side at a time.
  const [view, setView] = useState<"chat" | "blueprint">("chat");

  const [busy, setBusy] = useState(false);
  // Whole seconds since the current request started, so the wait can say how
  // long it has been.
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // "copied" or "downloaded", so the message can say what actually happened.
  const [handoff, setHandoff] = useState<"copied" | "downloaded" | null>(null);

  // The retrieved article, if the corpus covers this job. Kept apart from the
  // analysis because it arrives separately and outlives it failing.
  const [playbook, setPlaybook] = useState<PlaybookResponse | null>(null);
  // Which text the article was found for, so answering a question, which does
  // not change the description, does not fetch the same article again.
  const searched = useRef<string | null>(null);
  // Every article there is, so an empty match can be explained rather than
  // looking like something broke. Empty if it fails to load.
  const [library, setLibrary] = useState<LibraryArticle[]>([]);

  // How the tools fit together and what is left to build. Asked for once a map
  // is on screen, and simply left out if it fails.
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);

  // Keyed by the question text, because ids are regenerated on every run and an
  // answer has to outlive the analysis that prompted it. Answers accumulate:
  // something said two rounds ago is still true now.
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [effortInput, setEffortInput] = useState<EffortInput | null>(null);
  const [shared, setShared] = useState<SharedAnalysis | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiry, setShareExpiry] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(() => Boolean(shareIdFromUrl()));
  // Shown only when something was actually brought back, so the notice is news
  // rather than furniture.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setBlueprint(null);
    if (!result?.graph) return;

    let current = true;
    fetchBlueprint(result.graph, result.plan)
      .then((built) => current && setBlueprint(built))
      .catch(() => current && setBlueprint(null));
    return () => {
      current = false;
    };
  }, [result]);

  // Counted from the clock rather than by adding one a tick, because a
  // background tab slows its timers down and the count would drift.
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    fetchExamples().then(setExamples).catch(() => setExamples([]));
    fetchLibrary().then(setLibrary).catch(() => setLibrary([]));
  }, []);

  // What was in the box last time, from this browser and nowhere else. Skipped
  // on a /s/<id> URL, where the visitor came to read somebody else's analysis
  // and has no interest in a draft of their own.
  useEffect(() => {
    if (shareIdFromUrl()) return;

    const draft = loadDraft();
    if (!draft) return;

    setDescription(draft.description);
    setAnswers(draft.answers);
    setRestored(true);
  }, []);

  // Written on a timer rather than on every keystroke. Storage is synchronous,
  // so writing a few kilobytes on each character typed is work done on the
  // thread that is trying to render the character.
  //
  // Checks the URL rather than the `shared` state, which is null until the fetch
  // comes back. In that gap the box is empty, an empty box clears the draft, and
  // opening somebody else's link would quietly delete your own work.
  useEffect(() => {
    if (shareIdFromUrl()) return;
    const timer = setTimeout(() => saveDraft(description, answers), 400);
    return () => clearTimeout(timer);
  }, [description, answers]);

  // A /s/<id> URL opens somebody else's analysis instead of a blank page.
  useEffect(() => {
    const id = shareIdFromUrl();
    if (!id) return;

    fetchShare(id)
      .then((analysis) => {
        setShared(analysis);
        setResult({
          ok: true,
          model: "a shared link",
          graph: analysis.graph,
          plan: analysis.plan,
          extraction_attempts: [],
          assessment_attempts: [],
          error: null,
        });
        setVersion((v) => v + 1);
      })
      .catch((exc) => setError(exc instanceof Error ? exc.message : "Could not open that link."))
      .finally(() => setOpening(false));
  }, []);

  /**
   * Send one round to the model, or to a recording.
   *
   * The text and the recording are passed in rather than read from state,
   * because the callers change both just before calling, and state set in the
   * same event is not visible until the next render.
   */
  async function run(given: Answer[], text: string, replay: string | undefined) {
    setBusy(true);
    setError(null);
    setSelected(null);
    setShareUrl(null);
    setHandoff(null);

    // Its own request, deliberately not awaited with the others. Retrieval takes
    // about a second and needs no generation, so the article lands while the
    // slow half is still working and stays on screen if that half never
    // finishes at all, which on a bad afternoon is the only thing that arrives.
    if (searched.current !== text) {
      searched.current = text;
      setPlaybook(null);
      fetchPlaybook(text)
        .then(setPlaybook)
        .catch(() => setPlaybook(null));
    }

    let outcome = "";
    let failed = false;
    try {
      // Answering means going to the model. A recorded example replays one fixed
      // response, so replaying it would hand back the identical analysis and
      // look, reasonably enough, like the answers had been ignored.
      const response = await analyse(text, given.length ? undefined : replay, given);
      if (response.graph) {
        setResult(response);
        setVersion((v) => v + 1);
      }
      if (!response.ok && response.error) setError(response.error);
      failed = !response.graph;
      outcome = response.plan?.headline ?? response.error ?? "Mapped, but not judged.";
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : "Something went wrong.";
      setError(message);
      outcome = message;
      failed = true;
    } finally {
      setBusy(false);
    }

    setRounds((all) =>
      all.map((round, i) => (i === all.length - 1 ? { ...round, outcome, failed } : round)),
    );
  }

  /** Everything answered so far, trimmed and with the blanks dropped. */
  function answersGiven(): Answer[] {
    return Object.entries(answers)
      .map(([question, answer]) => ({ question, answer: answer.trim() }))
      .filter((a) => a.answer.length > 0)
      .slice(0, MOST_ANSWERS);
  }

  /** The first round: a description, typed or from an example. */
  function send(text: string, replay: string | undefined) {
    if (text.trim().length < SHORTEST) return;
    void loadCanvas(); // Fetched during the wait, so the answer is not held up by it.
    setRestored(false);
    setResult(null);
    setTab("map");
    setView("chat");
    setRounds([{ kind: "description", text, answers: [], outcome: null, failed: false }]);
    run([], text, replay);
  }

  function startExample(example: Example) {
    setDescription(example.description);
    setAnswers({}); // A different process, so nothing said about the last one holds.
    // Recorded examples replay from disk, so they work with no API key and
    // cost nothing. Anything typed by hand goes to the model.
    const replay = example.replayable ? example.id : undefined;
    setReplayCase(replay);
    send(example.description, replay);
  }

  function redraw() {
    const given = answersGiven();
    if (!given.length) return;
    setRounds((all) => [
      ...all,
      { kind: "answers", text: "", answers: given, outcome: null, failed: false },
    ]);
    run(given, description, undefined);
  }

  /** Something the description left out, added to it and mapped again. */
  function addDetail(detail: string) {
    const added = detail.trim();
    if (!added) return;
    const text = `${description.trim()}\n\n${added}`;
    setDescription(text);
    setReplayCase(undefined); // The recording was of the words before this.
    setRounds((all) => [
      ...all,
      { kind: "detail", text: added, answers: [], outcome: null, failed: false },
    ]);
    run(answersGiven(), text, undefined);
  }

  /** Back to the first screen, with nothing carried over. */
  function reset() {
    setRounds([]);
    setResult(null);
    setError(null);
    setPlaybook(null);
    searched.current = null;
    setAnswers({});
    setShared(null);
    setShareUrl(null);
    setHandoff(null);
    setSelected(null);
    setTab("map");
    setView("chat");
    setDescription("");
    setReplayCase(undefined);
    setRestored(false);
    clearDraft();
    if (shareIdFromUrl()) window.history.replaceState(null, "", "/");
  }

  async function exportWorkflow() {
    if (!result?.graph) return;
    setExporting(true);
    try {
      const workflow = await buildWorkflow(result.graph, result.plan);

      // Straight to the clipboard, because n8n takes a paste onto its canvas
      // and that skips the file, the downloads folder and the import dialog.
      // If the browser refuses, fall back to the file rather than stopping.
      if (await copyToClipboard(workflow)) {
        setHandoff("copied");
      } else {
        // Some browsers refuse clipboard writes outright. Downloading instead
        // is the right fallback, but doing it silently leaves somebody staring
        // at a button that did nothing while a file lands in a folder they were
        // not looking at.
        const name = result.graph.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        download(new Blob([workflow], { type: "application/json" }), `${name}.n8n.json`);
        setHandoff("downloaded");
      }
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not build the workflow.");
    } finally {
      setExporting(false);
    }
  }

  async function downloadWorkflow() {
    if (!result?.graph) return;
    try {
      const workflow = await buildWorkflow(result.graph, result.plan);
      const name = result.graph.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      download(new Blob([workflow], { type: "application/json" }), `${name}.n8n.json`);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not build the workflow.");
    }
  }

  async function makeShareLink() {
    if (!result?.graph) return;
    setSharing(true);
    try {
      const created = await createShare(result.graph, result.plan, effortInput);
      const url = `${window.location.origin}/s/${created.id}`;
      setShareUrl(url);
      setShareExpiry(created.expires_at);
      // Put it in the address bar too, so the obvious copy is the right one.
      window.history.replaceState(null, "", `/s/${created.id}`);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not create the link.");
    } finally {
      setSharing(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // Clipboard access can be refused; the link is on screen anyway.
    }
  }

  // Stable, or the effort panel's reporting effect loops.
  const handleEffort = useCallback((effort: EffortInput | null) => {
    setEffortInput(effort);
    setShareUrl(null); // The numbers changed, so the old link is out of date.
  }, []);

  /**
   * Swap sides on a phone. The page is one long scroll there, so arriving at the
   * other side halfway down it would be arriving in the middle of something.
   */
  function show(side: "chat" | "blueprint") {
    setView(side);
    if (window.matchMedia("(max-width: 820px)").matches) window.scrollTo({ top: 0 });
  }

  /** From "worth doing first": the step, on the map, on whichever screen shows it. */
  function pick(stepId: string) {
    setSelected(stepId);
    setTab("map");
    show("blueprint");
  }

  function toQuestions() {
    show("chat");
    requestAnimationFrame(() =>
      document.getElementById("questions")?.scrollIntoView({ block: "start" }),
    );
  }

  if (opening) {
    return (
      <div className="app">
        <p className="muted opening">Opening that link...</p>
      </div>
    );
  }

  const started = rounds.length > 0 || Boolean(shared) || Boolean(result);

  if (!started) {
    return (
      <div className="app">
        <header className="bar bar--start">
          <Brand />
          <Source />
        </header>

        {error && <p className="error start__error">{error}</p>}

        <Start
          description={description}
          onChange={(text) => {
            setDescription(text);
            setReplayCase(undefined);
          }}
          onSend={() => send(description, replayCase)}
          examples={examples}
          onExample={startExample}
          restored={restored}
          onClearDraft={() => {
            clearDraft();
            setDescription("");
            setAnswers({});
            setRestored(false);
          }}
          library={library}
        />
      </div>
    );
  }

  // After a failure only a real match is worth keeping on screen. "No article
  // for this job" under an error message is one more thing that went nowhere.
  const article = playbook?.match ? (
    <Playbook match={playbook.match} retriever={playbook.retriever} />
  ) : playbook?.retriever && library.length > 0 && (busy || result?.graph) ? (
    <NoPlaybook library={library} />
  ) : null;

  const graph = result?.graph ?? null;

  return (
    <div className={`app work work--${view}`}>
      <header className="bar">
        <Brand onClick={reset} />

        <div className="bar__switch" role="group" aria-label="Show">
          <button aria-pressed={view === "chat"} onClick={() => show("chat")}>
            Conversation
          </button>
          <button
            aria-pressed={view === "blueprint"}
            onClick={() => show("blueprint")}
            disabled={!graph}
          >
            Blueprint
          </button>
        </div>

        <div className="bar__end">
          <Button variant="default" size="sm" leftSection={<IconPlus size={16} />} onClick={reset}>
            New process
          </Button>
          <Source />
        </div>
      </header>

      <div className="work__body">
        <Chat
          rounds={rounds}
          busy={busy}
          elapsed={elapsed}
          error={error}
          result={result}
          article={article}
          shared={shared}
          answers={answers}
          onAnswer={(question, answer) =>
            setAnswers((current) => ({ ...current, [question]: answer }))
          }
          given={answersGiven().length}
          onRedraw={redraw}
          onDetail={addDetail}
          onPick={pick}
          onShowBlueprint={() => show("blueprint")}
        />

        {graph ? (
          <Suspense fallback={<Ghost />}>
            <Canvas
              key={version}
              graph={graph}
              plan={result?.plan ?? null}
              blueprint={blueprint}
              tab={tab}
              onTab={setTab}
              selected={selected}
              onSelect={setSelected}
              busy={busy}
              readOnly={Boolean(shared)}
              onShare={makeShareLink}
              sharing={sharing}
              shareUrl={shareUrl}
              shareExpiry={shareExpiry}
              onCopyLink={copyLink}
              linkCopied={copied}
              onCopy={exportWorkflow}
              copying={exporting}
              handoff={handoff}
              onDownload={downloadWorkflow}
              effort={shared?.effort ?? null}
              onEffort={handleEffort}
              onQuestions={toQuestions}
            />
          </Suspense>
        ) : (
          <section className="canvas canvas--empty" aria-label="Blueprint">
            {busy ? (
              <Ghost inside />
            ) : (
              <div className="canvas__none">
                <p>No map this time.</p>
                <p className="muted">
                  The reply says what went wrong. Try again, or start from one of the
                  examples.
                </p>
                <Button variant="default" onClick={reset}>
                  Back to the start
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/** Where the map will be, while the first one is worked out. */
function Ghost({ inside = false }: { inside?: boolean }) {
  const ghost = (
    <div className="ghost" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <p>Your map appears here</p>
    </div>
  );
  return inside ? (
    ghost
  ) : (
    <section className="canvas canvas--empty" aria-label="Blueprint">
      {ghost}
    </section>
  );
}
