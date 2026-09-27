"""Tests for the build plan.

The one that matters most is the first: the page must never describe a workflow
the export does not actually produce. The rest check the wording people act on.
"""

import pytest

from app.api import EXAMPLES
from app.assess import assess_process
from app.blueprint import CHOICES, build_blueprint, limit_text
from app.export_n8n import IF_NODE, NO_OP, WAIT_NODE, to_n8n
from app.extract import extract_process
from app.llm.record import ReplayLLM
from app.schemas.assessment import Verdict
from app.schemas.common import ComparisonOperator, DataType, System, SystemCategory, Threshold
from app.schemas.process import StepKind
from tests.test_export_n8n import approval, branching_graph, plan_with, threshold_approval


def recorded(case: str):
    description = next(e["description"] for e in EXAMPLES if e["id"] == case)
    llm = ReplayLLM(case)
    graph = extract_process(description, llm).graph
    return graph, assess_process(graph, llm).plan


def cases():
    yield "no controls", branching_graph(), plan_with([])
    yield "approval", branching_graph(), plan_with([approval()])
    yield "limit", branching_graph(), plan_with([threshold_approval()])
    for case in ("invoice-with-approval", "payment-no-approval"):
        yield case, *recorded(case)


@pytest.mark.parametrize("label, graph, plan", list(cases()), ids=lambda v: v if isinstance(v, str) else "")
def test_it_describes_exactly_the_workflow_the_export_builds(label, graph, plan):
    workflow = to_n8n(graph, plan)
    blueprint = build_blueprint(graph, plan)
    types = [n["type"] for n in workflow["nodes"]]

    limits = [h for h in blueprint.approvals if h.gate == "limit"]
    branches = [h for h in blueprint.inside + [s for p in blueprint.places for s in p.steps] if h.node_type == IF_NODE]

    assert types.count(WAIT_NODE) == len(blueprint.approvals)
    assert types.count(IF_NODE) == len(branches) + len(limits)

    # The ready-made nodes it says the file contains are the ones it contains.
    exported = {t for t in types[1:] if t not in (IF_NODE, WAIT_NODE, NO_OP)}
    described = {
        h.node_type
        for h in blueprint.inside + [s for p in blueprint.places for s in p.steps]
        if h.node_type not in (IF_NODE, NO_OP)
    }
    assert exported == described


def test_every_step_is_placed_exactly_once():
    graph, plan = recorded("payment-no-approval")
    blueprint = build_blueprint(graph, plan)

    placed = [h.step_id for h in blueprint.inside] + [
        h.step_id for p in blueprint.places for h in p.steps
    ]
    assert sorted(placed) == sorted(s.id for s in graph.steps)


def test_a_named_system_gets_its_node_and_the_note_that_goes_with_it():
    graph, plan = recorded("invoice-with-approval")
    sheet = next(p for p in build_blueprint(graph, plan).places if p.category is SystemCategory.SPREADSHEET)

    assert sheet.node == "Google Sheets"
    assert "Google credential" in sheet.setup


def test_an_unnamed_email_is_left_as_a_choice_rather_than_guessed():
    """"Email" could be Gmail, Outlook or IMAP. Picking one would be inventing a fact."""

    graph, plan = recorded("payment-no-approval")
    inbox = next(p for p in build_blueprint(graph, plan).places if p.category is SystemCategory.EMAIL)

    assert inbox.node is None
    assert inbox.setup == CHOICES[SystemCategory.EMAIL]


def test_a_system_nobody_categorised_still_says_something_useful():
    graph = branching_graph()
    graph.systems.append(System(id="portal", name="the supplier portal", category=SystemCategory.OTHER))
    graph.steps[0].system_id = "portal"

    portal = build_blueprint(graph, plan_with([])).places[0]

    assert "HTTP Request" in portal.setup


def test_approvals_say_who_approves_and_what_the_limit_is():
    limited = build_blueprint(branching_graph(), plan_with([threshold_approval()]))
    asked = build_blueprint(branching_graph(), plan_with([approval()]))

    assert limited.approvals[0].gate == "limit"
    assert limited.approvals[0].limit == "over £5,000"
    assert asked.approvals[0].approver == "whoever owns the ledger"
    assert any("whoever owns the ledger" in t.title for t in asked.tasks)


@pytest.mark.parametrize(
    "operator, value, value_type, currency, expected",
    [
        (ComparisonOperator.GT, "5000", DataType.MONEY, "GBP", "over £5,000"),
        (ComparisonOperator.GTE, "250.5", DataType.MONEY, "EUR", "at or over €250.50"),
        (ComparisonOperator.LT, "10", DataType.NUMBER, None, "under 10"),
        (ComparisonOperator.GT, "100", DataType.MONEY, "CHF", "over 100 CHF"),
        (ComparisonOperator.CONTAINS, "urgent", DataType.TEXT, None, "containing urgent"),
        (ComparisonOperator.IS_EMPTY, None, DataType.TEXT, None, "invoice.po when empty"),
    ],
)
def test_a_limit_is_read_out_in_words(operator, value, value_type, currency, expected):
    field = "invoice.po" if operator is ComparisonOperator.IS_EMPTY else "invoice.total"
    threshold = Threshold(
        field=field, operator=operator, value=value, value_type=value_type, currency=currency
    )
    assert limit_text(threshold) == expected


def test_what_is_finished_comes_first_and_the_test_run_comes_last():
    tasks = build_blueprint(*recorded("payment-no-approval")).tasks
    statuses = [t.status for t in tasks]

    first_open = next(i for i, s in enumerate(statuses) if s != "done")
    assert all(s == "done" for s in statuses[:first_open])
    assert "done" not in statuses[first_open:]
    assert tasks[-1].title.startswith("Try it once")


def test_open_questions_become_a_task_that_links_to_them():
    graph, plan = recorded("payment-no-approval")
    assert graph.questions

    task = next(t for t in build_blueprint(graph, plan).tasks if t.action == "questions")
    assert str(len(graph.questions)) in task.detail


def test_a_step_that_stays_with_a_person_is_handed_back_not_built():
    blueprint = build_blueprint(branching_graph(), plan_with([]))

    assert [h.step_id for h in blueprint.with_you] == ["ask_manager"]
    kept = next(h for h in blueprint.inside if h.step_id == "ask_manager")
    assert kept.node is None and kept.kind is StepKind.JUDGEMENT
    assert any(t.title == 'Keep "Ask the manager" with a person' for t in blueprint.tasks)


def test_it_works_without_a_plan_at_all():
    blueprint = build_blueprint(branching_graph(), None)

    assert not blueprint.approvals
    assert all(h.verdict is None for h in blueprint.inside)
    assert blueprint.tasks[0].status == "done"


def test_one_of_each_reads_as_one():
    graph = branching_graph()
    titles = [t.title for t in build_blueprint(graph, plan_with([approval()])).tasks]

    assert "1 branch, as an IF node" in titles
    assert "1 approval pause, as a Wait node" in titles


def test_the_verdict_travels_with_each_step():
    graph, plan = recorded("payment-no-approval")
    blueprint = build_blueprint(graph, plan)
    pay = next(h for p in blueprint.places for h in p.steps if h.step_id == "pay_invoice")

    assert pay.verdict is Verdict.AUTOMATABLE_WITH_CONTROL
    assert pay.gate == "approval"


def test_ready_made_nodes_are_listed_the_way_a_person_would_say_them():
    titles = [t.title for t in build_blueprint(*recorded("invoice-with-approval")).tasks]

    assert "Ready-made nodes for Google Sheets and Slack" in titles
