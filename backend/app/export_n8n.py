"""Turn a process graph and its automation plan into an n8n workflow file.

What this produces is a first draft, not a running automation, and each node
says what is left to do in it. Guessing that someone means Gmail rather than
Outlook or IMAP, or which spreadsheet a row goes in, would produce a file that
imports and then does the wrong thing in ways that are tedious to unpick.

What it does get right, and what makes it worth exporting at all:

  - the shape. Steps, branches and the order they run in, laid out left to
    right the way n8n draws a workflow.
  - decisions become real IF nodes, or Switch nodes for three ways out or more,
    set to the test when a branch has one.
  - approvals become real Wait nodes, so the pause is in the workflow rather
    than in a paragraph somebody has to remember to read.
  - a threshold approval becomes an IF on the threshold, so "only above 5,000"
    is encoded rather than described. This is what the structured Threshold on
    a control is for.
  - a system the person named becomes its real node, set to what the step
    does and filled in from the process. See n8n_settings.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.n8n_catalogue import GMAIL_TRIGGER, SET, NodeChoice, choose_node, choose_trigger
from app.n8n_settings import (
    Earlier,
    Filled,
    Where,
    fill,
    fill_trigger,
    makes_fields,
    shape_of,
    value_of,
)
from app.schemas.assessment import AutomationPlan, Control, ControlKind, StepAssessment
from app.schemas.common import ComparisonOperator, DataItem, DataType, Threshold
from app.schemas.process import Edge, ProcessGraph, Step, StepKind, TriggerKind

# The trigger when nothing named picks a real one. Only ones that exist and take
# no credentials, so the file always imports cleanly.
TRIGGER_TYPES: dict[TriggerKind, str] = {
    TriggerKind.SCHEDULE: "n8n-nodes-base.scheduleTrigger",
    TriggerKind.WEBHOOK: "n8n-nodes-base.webhook",
    TriggerKind.FORM_SUBMISSION: "n8n-nodes-base.formTrigger",
    TriggerKind.MANUAL: "n8n-nodes-base.manualTrigger",
    TriggerKind.INBOUND_MESSAGE: "n8n-nodes-base.scheduleTrigger",
    TriggerKind.FILE_ARRIVAL: "n8n-nodes-base.scheduleTrigger",
}

NO_OP = "n8n-nodes-base.noOp"
IF_NODE = "n8n-nodes-base.if"
SWITCH_NODE = "n8n-nodes-base.switch"
WAIT_NODE = "n8n-nodes-base.wait"

# Checked against n8n's source: 2.2 is the version whose conditions carry
# version 2, which is what _threshold_parameters writes.
IF_VERSION = 2.2

# A decision with three or more ways out. An IF has two outputs, and n8n drops
# a line from an output a node does not have, so the third branch and every one
# after it used to vanish on import. 3.2 is the Switch whose rules carry
# version 2 conditions, the same as the IF's.
SWITCH_VERSION = 3.2

# n8n shows an output's name beside its dot, so it has to be short.
OUTPUT_LIMIT = 40

# What to tell someone to put in place of each placeholder.
REPLACE_WITH: dict[StepKind, str] = {
    StepKind.READ: "the node for the system this reads from, e.g. Gmail, IMAP, HTTP Request",
    StepKind.EXTRACT: "an extraction node, e.g. Extract from File, or an AI node for documents",
    StepKind.TRANSFORM: "a Code or Set node",
    StepKind.WRITE: "the node for the system this writes to, e.g. Google Sheets, Airtable, HTTP Request",
    StepKind.NOTIFY: "a messaging node, e.g. Slack, Send Email",
    StepKind.JUDGEMENT: "nothing. A person does this.",
    StepKind.WAIT: "a Wait node configured with the real delay",
    StepKind.DECISION: "nothing. This is already an IF or Switch.",
}

OPERATOR_MAP: dict[ComparisonOperator, str] = {
    ComparisonOperator.GT: "gt",
    ComparisonOperator.GTE: "gte",
    ComparisonOperator.LT: "lt",
    ComparisonOperator.LTE: "lte",
    ComparisonOperator.EQ: "equals",
    ComparisonOperator.NEQ: "notEquals",
    ComparisonOperator.CONTAINS: "contains",
    ComparisonOperator.NOT_CONTAINS: "notContains",
    ComparisonOperator.IS_EMPTY: "empty",
    ComparisonOperator.IS_NOT_EMPTY: "notEmpty",
}

# The gap between nodes, left to right and top to bottom.
COLUMN = 260
ROW = 200

# n8n shows node names in a small box, so long ones get unreadable. Trim at a
# word boundary rather than mid-word; the full text is in the note anyway.
NAME_LIMIT = 54

TRIGGER_NAMES: dict[TriggerKind, str] = {
    TriggerKind.SCHEDULE: "On a schedule",
    TriggerKind.WEBHOOK: "On a webhook call",
    TriggerKind.FORM_SUBMISSION: "On a form submission",
    TriggerKind.MANUAL: "Started by hand",
    TriggerKind.INBOUND_MESSAGE: "When a message arrives",
    TriggerKind.FILE_ARRIVAL: "When a file arrives",
}


def _shorten(text: str, limit: int = NAME_LIMIT) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0]
    return f"{cut or text[: limit - 1]}..."


class _Builder:
    """Accumulates nodes and connections, keyed by the display name n8n uses."""

    def __init__(self) -> None:
        self.nodes: list[dict[str, Any]] = []
        self.connections: dict[str, dict[str, list[list[dict[str, Any]]]]] = {}
        self.by_name: dict[str, dict[str, Any]] = {}

    def add(
        self,
        name: str,
        node_type: str,
        *,
        parameters: dict | None = None,
        notes: str | None = None,
        type_version: float = 1,
        outputs: int = 1,
    ) -> str:
        """Add a node and return the unique name it ended up with."""

        unique = name
        suffix = 2
        while unique in self.by_name:
            unique = f"{name} ({suffix})"
            suffix += 1

        node: dict[str, Any] = {
            "parameters": parameters or {},
            "id": unique.lower().replace(" ", "-")[:60],
            "name": unique,
            "type": node_type,
            "typeVersion": type_version,
            "position": [0, 0],
        }
        self.nodes.append(node)
        self.by_name[unique] = node
        if notes:
            self.note(unique, notes)

        self.connections.setdefault(unique, {"main": [[] for _ in range(outputs)]})
        return unique

    def note(self, name: str, notes: str) -> None:
        self.by_name[name]["notes"] = notes
        self.by_name[name]["notesInFlow"] = True

    def connect(self, source: str, target: str, output: int = 0) -> None:
        main = self.connections.setdefault(source, {"main": [[]]})["main"]
        while len(main) <= output:
            main.append([])
        main[output].append({"node": target, "type": "main", "index": 0})

    def arrange(self) -> None:
        """Lay the nodes out left to right, the way n8n draws a workflow.

        Each node goes one column past the furthest node that feeds it, so a
        line only ever runs forwards. Stacked in one column, as they used to
        be, every line left a node on the right and came back round to the
        next one's input on the left, and the canvas was a row of loops.
        """

        names = [node["name"] for node in self.nodes]
        targets = {
            name: [t["node"] for output in self.connections.get(name, {"main": []})["main"] for t in output]
            for name in names
        }

        # The order to stack a column in: from the trigger, following each
        # node's outputs in turn, so the true side of a branch sits on top.
        order: dict[str, int] = {}
        queue = names[:1]
        while queue:
            name = queue.pop(0)
            if name not in order:
                order[name] = len(order)
                queue.extend(targets[name])
        for name in names:
            order.setdefault(name, len(order))

        # The longest route in to each node. The process schema refuses loops,
        # so one pass in dependency order settles every column.
        column = dict.fromkeys(names, 0)
        waiting = dict.fromkeys(names, 0)
        for name in names:
            for target in targets[name]:
                waiting[target] += 1
        ready = [name for name in names if not waiting[name]]
        while ready:
            name = ready.pop(0)
            for target in targets[name]:
                column[target] = max(column[target], column[name] + 1)
                waiting[target] -= 1
                if not waiting[target]:
                    ready.append(target)

        stacks: dict[int, list[str]] = {}
        for name in sorted(names, key=order.__getitem__):
            stacks.setdefault(column[name], []).append(name)
        for index, stack in stacks.items():
            top = -(len(stack) - 1) * ROW // 2
            for row, name in enumerate(stack):
                self.by_name[name]["position"] = [index * COLUMN, top + row * ROW]


@dataclass
class Built:
    """The workflow, and what the page needs to know about how it was made."""

    workflow: dict
    # What is left to do in each step's node, by step id. Missing when nothing is.
    left: dict[str, tuple[str, ...]] = field(default_factory=dict)
    trigger_left: tuple[str, ...] = ()


def to_n8n(graph: ProcessGraph, plan: AutomationPlan | None = None) -> dict:
    """Build an importable n8n workflow from a process and its plan."""

    return build(graph, plan).workflow


def build(graph: ProcessGraph, plan: AutomationPlan | None = None) -> Built:
    """The workflow, and what is left to do in it. The page reads the second."""

    builder = _Builder()
    assessments = {a.step_id: a for a in (plan.assessments if plan else [])}

    trigger_label, trigger_type, trigger = trigger_node(graph)
    started = fill_trigger(trigger) if trigger else Filled(_trigger_parameters(graph))
    trigger_name = builder.add(
        trigger_label,
        trigger_type,
        parameters=started.parameters,
        notes=_trigger_notes(graph, trigger, started.left),
        type_version=trigger.version if trigger else 1,
    )

    # Each step becomes one or more nodes. entry_of is where an incoming edge
    # should land (an approval gate, if the step has one) and body_of is the
    # step's own node, which a following edge leaves from.
    entry_of: dict[str, str] = {}
    body_of: dict[str, str] = {}
    choice_of: dict[str, NodeChoice | None] = {}

    for step in graph.steps:
        assessment = assessments.get(step.id)
        choice, node_type = step_node(step, assessment, graph)
        entry, body = _build_step(builder, step, assessment, graph, choice, node_type)
        entry_of[step.id], body_of[step.id], choice_of[step.id] = entry, body, choice

    builder.connect(trigger_name, entry_of[graph.trigger.first_step_id])

    for step in graph.steps:
        for index, edge in enumerate(branches(graph, step)):
            output = index if step.kind is StepKind.DECISION else 0
            builder.connect(body_of[step.id], entry_of[edge.to_step], output)

    # Filled in once every node has its name, because a step reads its fields
    # out of earlier nodes by name, and an earlier step can come later in the list.
    email_trigger = trigger_name if trigger is GMAIL_TRIGGER else None
    left: dict[str, tuple[str, ...]] = {}

    for step in graph.steps:
        earlier = tuple(
            Earlier(s, body_of[s.id], shape_of(choice_of[s.id], s)) for s in _before(graph, step.id)
        )
        email = next((e.node for e in earlier if e.shape == "email"), email_trigger)
        where = Where(graph, step, earlier, email)

        # A test on a value reads it from the step that worked it out.
        gate = approval_gate(assessments.get(step.id))
        if gate and gate.kind is ControlKind.THRESHOLD_APPROVAL and gate.threshold:
            builder.by_name[entry_of[step.id]]["parameters"] = _test(gate.threshold, where)

        filled = None
        if step.kind is StepKind.DECISION:
            builder.by_name[body_of[step.id]]["parameters"] = _branch_parameters(graph, step, where)
            if unset := _unset(graph, step):
                left[step.id] = (unset,)
        else:
            filled = fill(choice_of[step.id], where)
            if filled:
                builder.by_name[body_of[step.id]]["parameters"] = filled.parameters
                if filled.left:
                    left[step.id] = filled.left

        builder.note(body_of[step.id], _step_notes(step, assessments.get(step.id), filled, graph))

    builder.arrange()

    return Built(
        workflow={
            "name": graph.title,
            "nodes": builder.nodes,
            "connections": builder.connections,
            "settings": {"executionOrder": "v1"},
            "meta": {
                "description": (
                    f"{graph.summary} A first draft from the AI Automation Architect. "
                    "Each node's note says what is left to do in it before this will run."
                )
            },
            "tags": [],
        },
        left=left,
        trigger_left=started.left,
    )


def trigger_node(graph: ProcessGraph) -> tuple[str, str, NodeChoice | None]:
    """The trigger's name, its n8n type, and the real node it is, if it is one."""

    choice = choose_trigger(graph)
    name = TRIGGER_NAMES.get(graph.trigger.kind, "Start")
    fallback = TRIGGER_TYPES.get(graph.trigger.kind, "n8n-nodes-base.manualTrigger")
    return name, choice.type if choice else fallback, choice


def step_node(
    step: Step, assessment: StepAssessment | None, graph: ProcessGraph
) -> tuple[NodeChoice | None, str]:
    """The real node a step becomes, if any, and the type n8n will see.

    Shared with the blueprint, so the page names the same node the file holds.
    """

    if step.kind is StepKind.DECISION:
        return None, SWITCH_NODE if len(graph.outgoing(step.id)) > 2 else IF_NODE
    choice = node_for(step, assessment, graph)
    if choice:
        return choice, choice.type
    return None, SET.type if makes_fields(step) else NO_OP


def branches(graph: ProcessGraph, step: Step) -> list[Edge]:
    """The edges out of a step, in the order of the node's outputs.

    An IF sends items where its test is true out of its first output. So when
    only the second branch of two carries a test, the two swap round and the
    test is the one the IF makes. A Switch tries its rules in order and sends
    an item to the first that matches, so the branches with a test go first,
    in the order they were described, and the rest follow.
    """

    outgoing = graph.outgoing(step.id)
    if step.kind is not StepKind.DECISION:
        return outgoing
    if len(outgoing) == 2 and not outgoing[0].condition_test and outgoing[1].condition_test:
        return [outgoing[1], outgoing[0]]
    if len(outgoing) > 2:
        return [e for e in outgoing if e.condition_test] + [e for e in outgoing if not e.condition_test]
    return outgoing


def _before(graph: ProcessGraph, step_id: str) -> list[Step]:
    """Every step that runs before this one, nearest first."""

    feeds: dict[str, list[str]] = {}
    for edge in graph.edges:
        feeds.setdefault(edge.to_step, []).append(edge.from_step)

    seen = {step_id}
    queue = list(feeds.get(step_id, []))
    found: list[Step] = []
    while queue:
        sid = queue.pop(0)
        if sid in seen:
            continue
        seen.add(sid)
        step = graph.step(sid)
        if step:
            found.append(step)
        queue.extend(feeds.get(sid, []))
    return found


def approval_gate(assessment: StepAssessment | None) -> Control | None:
    """The control that puts a pause in front of a step, if any.

    The first one that makes a gate wins, in the order the plan lists them. A
    threshold approval with no threshold cannot be encoded as a check, so it is
    passed over for whatever comes next. Shared with the blueprint, so the page
    and the file always agree on where the pauses are.
    """

    for control in assessment.controls if assessment else []:
        if control.kind is ControlKind.THRESHOLD_APPROVAL and control.threshold:
            return control
        if control.kind in (ControlKind.HUMAN_APPROVAL, ControlKind.DRY_RUN_FIRST):
            return control
    return None


def node_for(step: Step, assessment: StepAssessment | None, graph: ProcessGraph) -> NodeChoice | None:
    """The real node a step becomes, or None for a placeholder. See n8n_catalogue."""

    capability = assessment.tool.capability if assessment and assessment.tool else None
    return choose_node(step, graph, capability)


def _build_step(
    builder: _Builder,
    step: Step,
    assessment: StepAssessment | None,
    graph: ProcessGraph,
    choice: NodeChoice | None,
    node_type: str,
) -> tuple[str, str]:
    """Return (entry node, body node) for one step, inserting any approval gate."""

    gate_entry: str | None = None
    gate_exit: str | None = None

    gate = approval_gate(assessment)
    if gate and gate.kind is ControlKind.THRESHOLD_APPROVAL and gate.threshold:
        # Encode the limit as a real branch. Above it, wait for a person;
        # below it, carry straight on.
        check = builder.add(
            _shorten(f"Over the limit? {step.name}"),
            IF_NODE,
            parameters=_threshold_parameters(gate.threshold),
            notes=gate.reason,
            type_version=IF_VERSION,
            outputs=2,
        )
        wait = builder.add(
            _shorten(f"Wait for approval: {step.name}"),
            WAIT_NODE,
            parameters={"resume": "webhook"},
            notes=_approval_notes(gate.who_approves, gate.reason),
            type_version=1,
        )
        builder.connect(check, wait, 0)
        gate_entry, gate_exit = check, wait
    elif gate:
        wait = builder.add(
            _shorten(f"Wait for approval: {step.name}"),
            WAIT_NODE,
            parameters={"resume": "webhook"},
            notes=_approval_notes(gate.who_approves, gate.reason),
            type_version=1,
        )
        gate_entry = gate_exit = wait

    if step.kind is StepKind.DECISION:
        body = builder.add(
            _shorten(step.name),
            node_type,
            parameters=_branch_parameters(graph, step),
            type_version=SWITCH_VERSION if node_type == SWITCH_NODE else IF_VERSION,
            outputs=max(2, len(graph.outgoing(step.id))),
        )
    else:
        # A real node where the description named a system we recognise, a
        # placeholder otherwise. See n8n_catalogue for why that line is drawn
        # from what the person said rather than from what the model suggested.
        version = choice.version if choice else SET.version if node_type == SET.type else 1
        body = builder.add(_shorten(step.name), node_type, type_version=version)

    if gate_entry and gate_exit:
        builder.connect(gate_exit, body)
        # The below-threshold branch skips the wait and goes straight through.
        if builder.connections[gate_entry]["main"] and gate_entry != gate_exit:
            builder.connect(gate_entry, body, 1)
        return gate_entry, body

    return body, body


def _branch_parameters(graph: ProcessGraph, step: Step, where: Where | None = None) -> dict:
    """What a branch tests, from each branch that was described as a check.

    Two ways out make an IF on the first branch's test. More make a Switch
    with a rule per branch. When exactly one branch has no test, it is the
    "anything else" of the others, and becomes the Switch's fallback output
    rather than a rule nobody can write.
    """

    edges = branches(graph, step)
    if len(edges) <= 2:
        first = edges[0].condition_test if edges else None
        return _threshold_parameters(first, _source(first, where)) if len(edges) == 2 and first else {}

    untested = [e for e in edges if not e.condition_test]
    fallback = untested[0] if len(untested) == 1 else None

    rules = []
    for index, edge in enumerate(e for e in edges if e is not fallback):
        if edge.condition_test:
            conditions = _threshold_parameters(edge.condition_test, _source(edge.condition_test, where))["conditions"]
            conditions["conditions"][0]["id"] = f"branch-{index + 1}"
        else:
            conditions = {**_threshold_parameters(None)["conditions"], "conditions": []}
        rules.append(
            {
                "conditions": conditions,
                "renameOutput": True,
                "outputKey": _output_name(edge, index),
            }
        )

    options: dict[str, Any] = {}
    if fallback:
        options = {"fallbackOutput": "extra", "renameFallbackOutput": _output_name(fallback, len(rules))}
    return {"mode": "rules", "rules": {"values": rules}, "options": options}


def _output_name(edge: Edge, index: int) -> str:
    return _shorten(edge.condition or f"Branch {index + 1}", OUTPUT_LIMIT)


def _unset(graph: ProcessGraph, step: Step) -> str | None:
    """What is left to set in a branch, or None when every test is in place."""

    edges = branches(graph, step)
    if len(edges) <= 2:
        if len(edges) == 2 and edges[0].condition_test:
            return None
        return "Set the check it makes, so each branch gets the right items."

    untested = [e for e in edges if not e.condition_test]
    if len(untested) <= 1:
        return None
    names = [f'"{e.condition}"' for e in untested if e.condition]
    listed = f"{', '.join(names[:-1])} and {names[-1]}" if len(names) > 1 else "".join(names)
    return f"Set the check for {listed}, so each branch gets the right items."


def _source(threshold: Threshold | None, where: Where | None) -> str | None:
    """Where a test's value comes from: the earlier step that produced it."""

    if not threshold or not where:
        return None
    return value_of(DataItem(name=threshold.field, data_type=threshold.value_type), where)


def _test(threshold: Threshold, where: Where) -> dict:
    """The same test, reading its value from the earlier step that produced it."""

    return _threshold_parameters(threshold, _source(threshold, where))


def _trigger_parameters(graph: ProcessGraph) -> dict:
    if graph.trigger.kind is TriggerKind.SCHEDULE:
        return {"rule": {"interval": [{"field": "days", "daysInterval": 1}]}}
    if graph.trigger.kind is TriggerKind.WEBHOOK:
        return {"path": graph.trigger.first_step_id, "httpMethod": "POST"}
    return {}


def _trigger_notes(graph: ProcessGraph, choice: NodeChoice | None, left: tuple[str, ...]) -> str:
    note = f"{graph.trigger.description}"
    if graph.trigger.schedule_hint:
        note += f"\nTiming as described: {graph.trigger.schedule_hint}. Set the real schedule here."
    if not choice and graph.trigger.kind in (TriggerKind.INBOUND_MESSAGE, TriggerKind.FILE_ARRIVAL):
        note += (
            "\nThis was described as happening when something arrives. A polling "
            "schedule is used as a stand-in. Replace it with the matching trigger "
            "for that system if it has one."
        )
    if left:
        note += "\nLeft to do: " + " ".join(left)
    return note


def _step_notes(
    step: Step, assessment: StepAssessment | None, filled: Filled | None, graph: ProcessGraph
) -> str:
    lines = [step.description]

    if step.iterates_over:
        lines.append(f"Repeats for: {step.iterates_over}. Add a Split In Batches node if needed.")
    if step.assumption:
        lines.append(f"Assumed: {step.assumption}")

    if assessment:
        lines.append(f"Verdict: {assessment.verdict.value.replace('_', ' ')}.")
        lines.append(assessment.rationale)
        if assessment.risks:
            lines.append("Risks: " + ", ".join(r.value.replace("_", " ") for r in assessment.risks))
        for blocker in assessment.blockers:
            lines.append(f"Blocked by {blocker.kind.value.replace('_', ' ')}: {blocker.detail}")

    if step.kind is StepKind.DECISION:
        edges = branches(graph, step)
        if len(edges) == 2:
            lines.extend(f"{label}: {edge.condition}" for label, edge in zip(("True", "False"), edges))
        if unset := _unset(graph, step):
            lines.append(f"Left to do: {unset}")
    elif filled:
        if filled.left:
            lines.append("Left to do: " + " ".join(filled.left))
    elif step.kind is StepKind.JUDGEMENT:
        lines.append("A person does this, so nothing is built for it.")
    elif replace := REPLACE_WITH.get(step.kind):
        lines.append(f"REPLACE THIS with {replace}")

    return "\n".join(line for line in lines if line)


def _approval_notes(who: str | None, reason: str) -> str:
    lines = [
        reason,
        "This pauses until the resume webhook is called. Wire that up to however "
        "approval actually happens: a Slack button, an email link, a form.",
    ]
    if who:
        lines.append(f"Approver: {who}")
    return "\n".join(lines)


def _threshold_parameters(threshold: Threshold | None, source: str | None = None) -> dict:
    """An IF node condition built from our structured threshold, or an empty one.

    The condition's own version has to match the node's: IF 2.2 and Switch 3.2
    read version 2 conditions, and an older number opens them in the older editor.
    """

    options = {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2}
    if threshold is None:
        return {"conditions": {"options": options, "conditions": [], "combinator": "and"}, "options": {}}

    numeric = threshold.value_type in (DataType.NUMBER, DataType.MONEY)
    operator = OPERATOR_MAP.get(threshold.operator, "equals")

    return {
        "conditions": {
            "options": options,
            "conditions": [
                {
                    "id": "threshold",
                    "leftValue": f"={source}" if source else f"={{{{ $json.{threshold.field} }}}}",
                    "rightValue": (
                        float(threshold.value)
                        if numeric and _is_number(threshold.value)
                        else (threshold.value or "")
                    ),
                    "operator": {
                        "type": "number" if numeric else "string",
                        "operation": operator,
                    },
                }
            ],
            "combinator": "and",
        },
        "options": {},
    }


def _is_number(value: str | None) -> bool:
    try:
        float(value or "")
    except (TypeError, ValueError):
        return False
    return True


def to_n8n_json(graph: ProcessGraph, plan: AutomationPlan | None = None) -> str:
    return json.dumps(to_n8n(graph, plan), indent=2)
