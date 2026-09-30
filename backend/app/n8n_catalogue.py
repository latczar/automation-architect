"""Which real n8n node should stand in for a step.

The model already works out what each step needs to be able to do. It fills in a
capability ("read new email", "write row to spreadsheet") and suggests tools for
it. That output is good, and it is not safe to use directly: asked for tools, it
offers "Zapier file download" and "Make.com iterator", which are other people's
products, and asked for n8n node names it would produce plausible ones that do
not exist. A workflow containing an invented node type pastes into n8n as a
broken node with no explanation.

So the split is the same as everywhere else here. The model says what the step
needs to do. This file decides what that maps to, from a fixed list of nodes
checked against n8n's own documentation. Anything that does not map confidently
stays a placeholder, because a placeholder saying what to put there is more
useful than a node that does not exist.

The strongest signal is not the capability, it is the system the person named.
"I type that into our Google Sheet" is not a guess about Google Sheets. Where
somebody said only "email", it stays a placeholder, because Gmail, Outlook and
IMAP are a real choice and picking one for them would be inventing a fact.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.schemas.process import ProcessGraph, Step, StepKind, TriggerKind


@dataclass(frozen=True)
class NodeChoice:
    """A real n8n node to emit in place of a placeholder."""

    type: str
    label: str
    # What connecting it takes. What is left in each node is worked out per
    # step, in n8n_settings, because it depends on what the step does.
    note: str
    # Emitted as typeVersion. The export sets parameters on every node, and
    # their names change between versions: Google Sheets calls the spreadsheet
    # "sheetId" at 1 and "documentId" at 4. So each version is pinned to the
    # one the parameters were checked against, picked old enough to be in any
    # install from the last year or two.
    version: float = 1


# Checked against each node's source in n8n-io/n8n rather than recalled. A wrong
# string here is the one failure that makes the whole paste look broken, so the
# list is short on purpose and grows only when something has been checked.
GMAIL = NodeChoice(
    "n8n-nodes-base.gmail",
    "Gmail",
    "Sign in with a Gmail credential. What each Gmail step does is set already.",
    version=2.1,
)
GMAIL_TRIGGER = NodeChoice(
    "n8n-nodes-base.gmailTrigger",
    "Gmail Trigger",
    "Sign in with a Gmail credential. It checks for new email every minute.",
    version=1.2,
)
GOOGLE_SHEETS = NodeChoice(
    "n8n-nodes-base.googleSheets",
    "Google Sheets",
    "Sign in with a Google credential.",
    version=4.5,
)
SLACK = NodeChoice(
    "n8n-nodes-base.slack",
    "Slack",
    "Sign in with a Slack credential.",
    version=2.2,
)
SEND_EMAIL = NodeChoice(
    "n8n-nodes-base.emailSend",
    "Send Email",
    "Add SMTP credentials, or swap this for the node matching your mail provider.",
    version=2.1,
)
HTTP = NodeChoice(
    "n8n-nodes-base.httpRequest",
    "HTTP Request",
    "Set the address it calls and how it signs in.",
    version=4.2,
)
CODE = NodeChoice(
    "n8n-nodes-base.code",
    "Code",
    "Write the transformation here. No credentials needed.",
    version=2,
)
SET = NodeChoice(
    "n8n-nodes-base.set",
    "Edit Fields",
    "Map the fields this step produces. No credentials needed.",
    version=3.4,
)

GMAIL_NAMES = ("gmail", "google mail")

# Matched against the systems the person named, which is the closest thing to a
# stated fact in the whole description.
BY_SYSTEM: tuple[tuple[tuple[str, ...], tuple[StepKind, ...], NodeChoice], ...] = (
    (("google sheet", "google sheets", "gsheet"), (StepKind.READ, StepKind.WRITE, StepKind.TRANSFORM), GOOGLE_SHEETS),
    (("slack",), (StepKind.NOTIFY, StepKind.WRITE), SLACK),
    (GMAIL_NAMES, (StepKind.READ, StepKind.WRITE, StepKind.NOTIFY), GMAIL),
)

# Weaker, so only used where the systems said nothing useful.
BY_CAPABILITY: tuple[tuple[tuple[str, ...], tuple[StepKind, ...], NodeChoice], ...] = (
    (("http", "rest api", "api call", "webhook call"), (StepKind.READ, StepKind.WRITE, StepKind.NOTIFY), HTTP),
    (("send email", "send an email", "email the", "reply to email"), (StepKind.NOTIFY,), SEND_EMAIL),
    (("calculate", "reformat", "reshape", "convert", "transform"), (StepKind.TRANSFORM,), CODE),
    (("map field", "set field", "build record"), (StepKind.TRANSFORM,), SET),
)


def _haystack(step: Step, graph: ProcessGraph, capability: str | None) -> str:
    """Everything we know about this step, lower case, in one string.

    The system name is included by looking up the step's system_id, because the
    graph stores systems separately and the useful words live in their names.
    """

    parts = [step.name, step.description, capability or ""]

    system = next((s for s in graph.systems if s.id == step.system_id), None)
    if system:
        parts.append(system.name)

    return " ".join(parts).lower()


def choose_node(step: Step, graph: ProcessGraph, capability: str | None) -> NodeChoice | None:
    """A real node for this step, or None to leave a placeholder.

    Returning None is a perfectly good answer and the common one. A placeholder
    that says what belongs there costs somebody one node to replace. A confident
    wrong node costs them the time to work out why it does not do what its name
    claims.
    """

    # A person doing something themselves has no node, and a branch already
    # became an IF before this was ever called.
    if step.kind in (StepKind.JUDGEMENT, StepKind.DECISION, StepKind.WAIT):
        return None

    text = _haystack(step, graph, capability)

    for needles, kinds, choice in BY_SYSTEM:
        if step.kind in kinds and any(n in text for n in needles):
            return choice

    for needles, kinds, choice in BY_CAPABILITY:
        if step.kind in kinds and any(n in text for n in needles):
            return choice

    return None


def choose_trigger(graph: ProcessGraph) -> NodeChoice | None:
    """A real trigger for email arriving in a Gmail the person named, or None.

    Anything else that arrives keeps the polling schedule the export stands in
    with. The rule is the one for steps: only a system somebody named picks a
    node, so "when an email comes in" alone stays a schedule.
    """

    if graph.trigger.kind is not TriggerKind.INBOUND_MESSAGE:
        return None

    system = next((s for s in graph.systems if s.id == graph.trigger.system_id), None)
    text = " ".join([graph.trigger.description, system.name if system else ""]).lower()
    return GMAIL_TRIGGER if any(name in text for name in GMAIL_NAMES) else None
