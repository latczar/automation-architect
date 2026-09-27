"""The build plan: how the tools fit together, and what is left to do.

The analysis says which steps are safe to hand over, and the export is a file.
Between the two, somebody still has to work out which of their systems the
automation will talk to, what connecting each one takes, and which parts of the
file are finished and which are placeholders. Left to be read out of node notes
one at a time, that is how a useful export ends up forgotten in a downloads
folder.

Everything here comes from the same decisions the export makes, through the
same functions, so the page cannot promise a node the file does not contain.
Nothing here asks a model anything.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.export_n8n import (
    IF_NODE,
    NO_OP,
    REPLACE_WITH,
    TRIGGER_NAMES,
    TRIGGER_TYPES,
    approval_gate,
    node_for,
)
from app.n8n_catalogue import NodeChoice
from app.schemas.assessment import AutomationPlan, ControlKind, Verdict
from app.schemas.common import ComparisonOperator, SystemCategory, Threshold
from app.schemas.process import ProcessGraph, StepKind


class Hookup(BaseModel):
    """One step, and what it turns into in the workflow."""

    step_id: str
    name: str
    kind: StepKind
    verdict: Verdict | None = None
    # The ready-made node's name, e.g. "Google Sheets", or "IF" for a branch.
    # None means a placeholder that says what belongs there.
    node: str | None = None
    # What n8n itself calls the node, for anybody who wants the detail.
    node_type: str
    gate: Literal["approval", "limit"] | None = None
    limit: str | None = None
    approver: str | None = None


class Place(BaseModel):
    """A system the process touches, and what connecting it takes."""

    id: str
    name: str
    category: SystemCategory
    notes: str | None = None
    steps: list[Hookup]
    node: str | None = None
    setup: str


class Task(BaseModel):
    """One line of the build checklist."""

    # done: the export already does it. todo: somebody has to. decide: somebody
    # has to make a call before anything can be built.
    status: Literal["done", "todo", "decide"]
    title: str
    detail: str
    action: Literal["copy", "questions"] | None = None


class Blueprint(BaseModel):
    trigger: str
    trigger_node: str
    trigger_type: str
    watches: str | None = None
    places: list[Place]
    # Steps that happen in no named system: the workflow does them itself.
    inside: list[Hookup]
    approvals: list[Hookup]
    with_you: list[Hookup]
    unclear: list[Hookup]
    tasks: list[Task]


# What connecting a system takes when nothing the person said picks a node.
# Named options only, never a choice made for them: "email" could be any of
# three, and choosing one would be inventing a fact about their business.
CHOICES: dict[SystemCategory, str] = {
    SystemCategory.EMAIL: (
        "You did not say which email, so no node was picked. Gmail, Microsoft "
        "Outlook and IMAP each have one."
    ),
    SystemCategory.SPREADSHEET: (
        "You did not say which spreadsheet, so no node was picked. Google Sheets, "
        "Microsoft Excel 365 and Airtable each have one."
    ),
    SystemCategory.CHAT: "Slack, Microsoft Teams and Telegram each have a node.",
    SystemCategory.CALENDAR: "Google Calendar and Microsoft Outlook each have a node.",
    SystemCategory.FILE_STORAGE: "Google Drive, Microsoft OneDrive and Dropbox each have a node.",
    SystemCategory.DATABASE: "Postgres, MySQL and Microsoft SQL each have a node.",
    SystemCategory.CRM: (
        "HubSpot, Salesforce and Pipedrive each have a node. Anything else needs "
        "HTTP Request and its API."
    ),
    SystemCategory.ACCOUNTING: (
        "Xero and QuickBooks Online each have a node. Anything else needs HTTP "
        "Request and its API."
    ),
    SystemCategory.PAYMENTS: (
        "Stripe and PayPal each have a node. A bank portal that people log in to "
        "usually has no API to call, so check before planning on it."
    ),
    SystemCategory.FORMS: "n8n has its own Form trigger, and most form tools have a node or a webhook.",
    SystemCategory.PHONE_OR_SMS: "Twilio and similar services have nodes for texts and calls.",
    SystemCategory.PAPER_OR_OFFLINE: (
        "Nothing to connect. This happens away from a screen, so it stays with a person."
    ),
}
ANYTHING_ELSE = (
    "HTTP Request, if it has an API. If people only log in to it through a "
    "website, this part stays by hand for now."
)

WORDS: dict[ComparisonOperator, str] = {
    ComparisonOperator.GT: "over",
    ComparisonOperator.GTE: "at or over",
    ComparisonOperator.LT: "under",
    ComparisonOperator.LTE: "at or under",
    ComparisonOperator.EQ: "exactly",
    ComparisonOperator.NEQ: "anything but",
    ComparisonOperator.CONTAINS: "containing",
    ComparisonOperator.NOT_CONTAINS: "not containing",
    ComparisonOperator.IS_EMPTY: "when empty",
    ComparisonOperator.IS_NOT_EMPTY: "when filled in",
}

SYMBOLS = {"GBP": "£", "USD": "$", "EUR": "€"}

# Steps that are placeholders because nothing was named, and that somebody
# therefore has to fill in. A judgement, a branch or a wait is not one of these.
FILLABLE = (StepKind.READ, StepKind.EXTRACT, StepKind.TRANSFORM, StepKind.WRITE, StepKind.NOTIFY)


def limit_text(threshold: Threshold) -> str:
    """A threshold recorded as "gt", "5000", "GBP", read out as "over £5,000"."""

    word = WORDS.get(threshold.operator, threshold.operator.value)
    if threshold.operator in (ComparisonOperator.IS_EMPTY, ComparisonOperator.IS_NOT_EMPTY):
        return f"{threshold.field} {word}"

    value = threshold.value or ""
    try:
        number = float(value)
    except ValueError:
        return f"{word} {value}".strip()

    shown = f"{number:,.0f}" if number.is_integer() else f"{number:,.2f}"
    currency = (threshold.currency or "").upper()
    if currency in SYMBOLS:
        return f"{word} {SYMBOLS[currency]}{shown}"
    return f"{word} {shown} {currency}".strip()


def build_blueprint(graph: ProcessGraph, plan: AutomationPlan | None) -> Blueprint:
    assessments = {a.step_id: a for a in (plan.assessments if plan else [])}

    hookups: list[Hookup] = []
    # The ready-made node each step became, kept so a system can say what
    # connecting it takes in the words the export's own node note uses.
    chosen: dict[str, NodeChoice] = {}
    for step in graph.steps:
        assessment = assessments.get(step.id)
        gate = approval_gate(assessment)

        if step.kind is StepKind.DECISION:
            node, node_type = "IF", IF_NODE
        else:
            choice = node_for(step, assessment, graph)
            if choice:
                chosen[step.id] = choice
            node, node_type = (choice.label, choice.type) if choice else (None, NO_OP)

        limited = gate is not None and gate.kind is ControlKind.THRESHOLD_APPROVAL
        hookups.append(
            Hookup(
                step_id=step.id,
                name=step.name,
                kind=step.kind,
                verdict=assessment.verdict if assessment else None,
                node=node,
                node_type=node_type,
                gate=("limit" if limited else "approval") if gate else None,
                limit=limit_text(gate.threshold) if limited and gate.threshold else None,
                approver=gate.who_approves if gate else None,
            )
        )

    system_of = {s.id: s.system_id for s in graph.steps}

    places: list[Place] = []
    for system in graph.systems:
        here = [h for h in hookups if system_of[h.step_id] == system.id]
        choice = next((chosen[h.step_id] for h in here if h.step_id in chosen), None)
        places.append(
            Place(
                id=system.id,
                name=system.name,
                category=system.category,
                notes=system.notes,
                steps=here,
                node=choice.label if choice else None,
                setup=choice.note if choice else CHOICES.get(system.category, ANYTHING_ELSE),
            )
        )

    inside = [h for h in hookups if not system_of[h.step_id]]
    approvals = [h for h in hookups if h.gate]
    with_you = [h for h in hookups if h.verdict is Verdict.HUMAN_REQUIRED]
    unclear = [h for h in hookups if h.verdict is Verdict.NEEDS_MORE_INFO]

    watches = next((s.name for s in graph.systems if s.id == graph.trigger.system_id), None)

    return Blueprint(
        trigger=graph.trigger.description,
        trigger_node=TRIGGER_NAMES.get(graph.trigger.kind, "Start"),
        trigger_type=TRIGGER_TYPES.get(graph.trigger.kind, "n8n-nodes-base.manualTrigger"),
        watches=watches,
        places=places,
        inside=inside,
        approvals=approvals,
        with_you=with_you,
        unclear=unclear,
        tasks=_tasks(graph, hookups, places, inside, approvals, with_you, unclear),
    )


def _plural(count: int, one: str, many: str) -> str:
    return f"{count} {one if count == 1 else many}"


def _yours(name: str) -> str:
    """A name somebody gave in passing reads as theirs; a product name stays as it is."""

    return f"your {name}" if name[:1].islower() else name


def _tasks(
    graph: ProcessGraph,
    hookups: list[Hookup],
    places: list[Place],
    inside: list[Hookup],
    approvals: list[Hookup],
    with_you: list[Hookup],
    unclear: list[Hookup],
) -> list[Task]:
    """The checklist, in the order somebody would actually work through it.

    What the export already did comes first, because knowing how much is
    finished is what makes the rest look like a short list rather than a
    project.
    """

    tasks: list[Task] = []

    tasks.append(
        Task(
            status="done",
            title=f"{_plural(len(graph.steps), 'step', 'steps')}, in the order you do them",
            detail="Each one arrives with a note saying what it does and how it was judged.",
        )
    )

    branches = [h for h in hookups if h.node_type == IF_NODE]
    if branches:
        tasks.append(
            Task(
                status="done",
                title=_plural(len(branches), "branch, as an IF node", "branches, as IF nodes"),
                detail="Where you said \"if\", the workflow splits the same way.",
            )
        )

    if approvals:
        names = ", ".join(f"\"{h.name}\"" for h in approvals)
        tasks.append(
            Task(
                status="done",
                title=_plural(
                    len(approvals), "approval pause, as a Wait node", "approval pauses, as Wait nodes"
                ),
                detail=f"The workflow stops before {names} until somebody says yes.",
            )
        )

    for hookup in approvals:
        if hookup.gate == "limit" and hookup.limit:
            tasks.append(
                Task(
                    status="done",
                    title=f"The limit on \"{hookup.name}\", as a check",
                    detail=f"Only {hookup.limit} waits for a person. Anything else carries straight on.",
                )
            )

    ready = sorted({h.node for h in hookups if h.node and h.node_type != IF_NODE})
    if ready:
        tasks.append(
            Task(
                status="done",
                title=(
                    f"A ready-made node for {ready[0]}"
                    if len(ready) == 1
                    else f"Ready-made nodes for {', '.join(ready[:-1])} and {ready[-1]}"
                ),
                detail="Picked because you named the system. Each still needs signing in to.",
            )
        )

    if graph.questions:
        tasks.append(
            Task(
                status="decide",
                title="Answer the open questions",
                detail=(
                    f"{_plural(len(graph.questions), 'question', 'questions')} it could not "
                    "answer from your description. Any answer could change the map."
                ),
                action="questions",
            )
        )

    tasks.append(
        Task(
            status="todo",
            title="Copy the workflow into n8n",
            detail="Click an empty canvas in n8n and paste. Nothing runs until you switch it on.",
            action="copy",
        )
    )

    for place in places:
        if place.category is SystemCategory.PAPER_OR_OFFLINE:
            continue
        tasks.append(
            Task(
                status="todo",
                title=(
                    f"Connect {_yours(place.name)}"
                    if place.node
                    else f"Choose how to reach {_yours(place.name)}"
                ),
                detail=place.setup,
            )
        )

    for hookup in inside:
        if hookup.node is None and hookup.kind in FILLABLE:
            tasks.append(
                Task(
                    status="todo",
                    title=f"Fill in \"{hookup.name}\"",
                    detail=f"It is a placeholder. Use {REPLACE_WITH[hookup.kind]}.",
                )
            )

    for hookup in approvals:
        who = hookup.approver or "the approver"
        tasks.append(
            Task(
                status="decide",
                title=f"Decide how approval for \"{hookup.name}\" reaches {who}",
                detail=(
                    "The workflow waits here until somebody says yes. A Slack button, "
                    "an email link or a form can send that answer back."
                ),
            )
        )

    for hookup in with_you:
        tasks.append(
            Task(
                status="decide",
                title=f"Keep \"{hookup.name}\" with a person",
                detail=(
                    "Nothing is built for this step. The workflow marks the spot but "
                    "does not wait, so add a Wait node if the steps after it need the answer."
                ),
            )
        )

    for hookup in unclear:
        tasks.append(
            Task(
                status="decide",
                title=f"Find out more about \"{hookup.name}\"",
                detail=(
                    "It could not tell whether this is safe to hand over. Describe the "
                    "step in more detail, or answer the questions."
                ),
            )
        )

    tasks.append(
        Task(
            status="todo",
            title="Try it once with a made-up item",
            detail=(
                "Run it by hand before switching the trigger on, and check each step "
                "did what its note says."
            ),
        )
    )

    return tasks
