"""What the export fills in on each node, and what it leaves for the person.

The first test is the reason this file exists. A step that checked Gmail was
exported as a Gmail node with nothing set, n8n opened it on its default
operation, which is send, and the workflow refused to start until somebody gave
an email it was never meant to send a subject and a message.
"""

import pytest

from app.blueprint import build_blueprint
from app.export_n8n import to_n8n
from app.n8n_catalogue import (
    CODE,
    GMAIL,
    GMAIL_TRIGGER,
    GOOGLE_SHEETS,
    HTTP,
    SEND_EMAIL,
    SET,
    SLACK,
    WHATSAPP,
)
from app.schemas.assessment import AutomationPlan, Confidence, StepAssessment, ToolMatch, Verdict
from app.schemas.common import (
    ComparisonOperator,
    DataItem,
    DataType,
    System,
    SystemCategory,
    Threshold,
)
from app.schemas.process import Edge, ProcessGraph, Step, StepKind, Trigger, TriggerKind

GMAIL_BOX = System(id="gmail", name="Gmail", category=SystemCategory.EMAIL)
SHEET = System(id="sheet", name="Google Sheets", category=SystemCategory.SPREADSHEET)
SLACK_CHAT = System(id="slack", name="Slack", category=SystemCategory.CHAT)


def item(name: str, kind: DataType = DataType.TEXT) -> DataItem:
    return DataItem(name=name, data_type=kind)


def enquiries(trigger_in: str = "Gmail", reply: bool = True) -> ProcessGraph:
    """Made up, and shaped like the process that first showed the problem."""

    steps = [
        Step(id="check", name="Check Gmail for new enquiry", description="Look at the inbox.",
             kind=StepKind.READ, system_id="gmail", outputs=[item("enquiry email", DataType.RECORD)]),
        Step(id="extract", name="Extract enquiry details", description="Pull out the details.",
             kind=StepKind.EXTRACT, inputs=[item("enquiry email", DataType.RECORD)],
             outputs=[item("customer name"), item("customer email", DataType.EMAIL_ADDRESS),
                      item("preferred date", DataType.DATE)]),
        Step(id="log", name="Log enquiry in Google Sheets", description="Add a row.",
             kind=StepKind.WRITE, system_id="sheet",
             inputs=[item("customer name"), item("customer email", DataType.EMAIL_ADDRESS),
                     item("preferred date", DataType.DATE)]),
    ]
    edges = [Edge(from_step="check", to_step="extract"), Edge(from_step="extract", to_step="log")]
    if reply:
        steps.append(
            Step(id="reply", name="Reply to the customer", description="Say we will be in touch.",
                 kind=StepKind.NOTIFY, system_id="gmail",
                 inputs=[item("customer name"), item("preferred date", DataType.DATE)])
        )
        edges.append(Edge(from_step="log", to_step="reply"))

    return ProcessGraph(
        title="Sales enquiry booking",
        summary="Enquiries arrive by email and go in a sheet.",
        trigger=Trigger(kind=TriggerKind.INBOUND_MESSAGE, description=f"An enquiry arrives in {trigger_in}",
                        system_id="gmail" if trigger_in == "Gmail" else None, first_step_id="check"),
        systems=[GMAIL_BOX, SHEET],
        steps=steps,
        edges=edges,
    )


def node(workflow: dict, name: str) -> dict:
    return next(n for n in workflow["nodes"] if n["name"] == name)


# --- The step that checks the inbox -------------------------------------------


def test_a_step_that_checks_gmail_is_not_exported_as_a_send():
    workflow = to_n8n(enquiries())
    check = node(workflow, "Check Gmail for new enquiry")

    assert check["parameters"]["operation"] != "send"
    assert "subject" not in check["parameters"] and "message" not in check["parameters"]


def test_an_email_arriving_in_gmail_starts_the_workflow_with_a_gmail_trigger():
    workflow = to_n8n(enquiries())
    trigger = workflow["nodes"][0]

    assert trigger["type"] == GMAIL_TRIGGER.type
    assert trigger["parameters"]["pollTimes"] == {"item": [{"mode": "everyMinute"}]}

    # And the step after it fetches that email whole, by its id.
    check = node(workflow, "Check Gmail for new enquiry")
    assert check["parameters"]["operation"] == "get"
    assert "When a message arrives" in check["parameters"]["messageId"]


def test_an_email_arriving_in_an_unnamed_inbox_keeps_the_schedule_stand_in():
    workflow = to_n8n(enquiries(trigger_in="the inbox"))
    assert workflow["nodes"][0]["type"] == "n8n-nodes-base.scheduleTrigger"

    # With nothing to fetch by id, the Gmail step looks for unread email itself.
    assert node(workflow, "Check Gmail for new enquiry")["parameters"]["operation"] == "getAll"


# --- Fields, and where each one comes from ------------------------------------


def test_the_details_picked_out_become_named_fields():
    workflow = to_n8n(enquiries())
    extract = node(workflow, "Extract enquiry details")

    assert extract["type"] == SET.type
    fields = {a["name"]: a["value"] for a in extract["parameters"]["assignments"]["assignments"]}
    assert set(fields) == {"customer name", "customer email", "preferred date"}

    # What any email carries is read off it; what is in somebody's own words is not guessed.
    assert "from.value[0].address" in fields["customer email"]
    assert fields["preferred date"] == ""
    assert "preferred date" in extract["notes"]


def test_the_sheet_row_reads_each_column_from_the_step_that_produced_it():
    workflow = to_n8n(enquiries())
    columns = node(workflow, "Log enquiry in Google Sheets")["parameters"]["columns"]

    assert columns["mappingMode"] == "defineBelow"
    assert set(columns["value"]) == {"customer name", "customer email", "preferred date"}
    for value in columns["value"].values():
        assert '$("Extract enquiry details")' in value


def test_a_sheet_names_its_first_tab_so_the_column_mapping_survives_the_paste():
    """n8n hides a Sheets node's columns until a tab is chosen, and drops what it hides."""

    sheet = node(to_n8n(enquiries()), "Log enquiry in Google Sheets")["parameters"]
    assert sheet["sheetName"]["value"] == "Sheet1"


def test_a_field_is_read_from_the_step_that_made_it_not_the_node_before():
    """A Gmail send in between hands on its own response, and the field would come through empty."""

    workflow = to_n8n(enquiries())
    reply = node(workflow, "Reply to the customer")["parameters"]

    assert '$("Extract enquiry details").item.json["preferred date"]' in reply["message"]


def test_names_match_whatever_the_spelling():
    graph = enquiries()
    graph.steps[2].inputs[0] = item("Customer_Name")
    columns = node(to_n8n(graph), "Log enquiry in Google Sheets")["parameters"]["columns"]

    assert '$("Extract enquiry details").item.json["customer name"]' in columns["value"]["Customer_Name"]


# --- Changing an email rather than sending one --------------------------------


def tidied(name: str) -> dict:
    """The parameters of one more Gmail step, after the reply, that does something to the email."""

    graph = enquiries()
    graph.steps.append(Step(id="tidy", name=name, description=name, kind=StepKind.WRITE, system_id="gmail"))
    graph.edges.append(Edge(from_step="reply", to_step="tidy"))
    return node(to_n8n(graph), name)


@pytest.mark.parametrize(
    "name, operation",
    [
        ("Archive the email", "removeLabels"),
        ("Delete the email", "removeLabels"),
        ("Mark the email as read", "markAsRead"),
        ("Label the email as an enquiry", "addLabels"),
        ("Save the PDF attachment", "get"),
        ("Update the record", "get"),
    ],
)
def test_a_gmail_step_that_changes_an_email_is_never_a_send(name, operation):
    """Left unset, each of these opened as a send, and tidying the inbox would email somebody."""

    tidy = tidied(name)["parameters"]
    assert tidy["operation"] == operation
    assert "Check Gmail for new enquiry" in tidy["messageId"]


def test_archiving_takes_the_email_out_of_the_inbox():
    assert tidied("Archive the email")["parameters"]["labelIds"] == ["INBOX"]


def test_deleting_archives_instead_and_says_why():
    """Gmail's delete skips the bin. Choosing that is the person's call, not ours."""

    tidy = tidied("Delete the email")
    assert tidy["parameters"]["operation"] != "delete"
    assert "cannot be got back" in tidy["notes"]


def test_saving_an_attachment_downloads_it():
    assert tidied("Save the PDF attachment")["parameters"]["options"] == {"downloadAttachments": True}


# --- Messages -----------------------------------------------------------------


def test_a_reply_goes_back_to_the_email_that_started_it():
    reply = node(to_n8n(enquiries()), "Reply to the customer")["parameters"]

    assert reply["operation"] == "reply"
    assert "Check Gmail for new enquiry" in reply["messageId"]
    # Addressed to them by name, not with their name listed as a detail.
    assert reply["message"].startswith('=Hello {{ $("Extract enquiry details")')
    assert "Customer name:" not in reply["message"]


def test_a_drafted_message_is_marked_as_a_draft():
    reply = node(to_n8n(enquiries()), "Reply to the customer")
    assert "put it in your own words" in reply["notes"]


def test_an_email_does_not_list_the_recipient_their_own_address():
    graph = enquiries(reply=False)
    graph.steps.append(
        Step(id="confirm", name="Email the customer", description="Confirm the booking.",
             kind=StepKind.NOTIFY, system_id="gmail",
             inputs=[item("customer email", DataType.EMAIL_ADDRESS), item("preferred date", DataType.DATE)])
    )
    graph.edges.append(Edge(from_step="log", to_step="confirm"))

    send = node(to_n8n(graph), "Email the customer")["parameters"]
    assert send["operation"] == "send"
    assert "customer email" in send["sendTo"]
    assert "Customer email:" not in send["message"]


def whatsapped(inputs: list[DataItem] | None = None) -> dict:
    graph = enquiries(reply=False)
    graph.systems.append(System(id="phone", name="WhatsApp", category=SystemCategory.CHAT))
    graph.steps.append(
        Step(id="ping", name="Send to WhatsApp", description="Send a notification to my WhatsApp.",
             kind=StepKind.NOTIFY, system_id="phone", inputs=inputs or [])
    )
    graph.edges.append(Edge(from_step="log", to_step="ping"))
    return node(to_n8n(graph), "Send to WhatsApp")


def test_a_named_whatsapp_sends_a_plain_message_not_a_template():
    """Empty, n8n's WhatsApp node opens on sending a template, which Meta has to approve first."""

    ping = whatsapped()
    assert ping["type"] == WHATSAPP.type
    assert ping["parameters"]["operation"] == "send"
    assert ping["parameters"]["messageType"] == "text"
    assert "Preferred date:" in ping["parameters"]["textBody"]


def test_whatsapp_says_what_it_needs_before_it_will_reach_anyone():
    notes = whatsapped()["notes"]
    assert "Fill in the number it goes to" in notes
    assert "last 24 hours" in notes


def test_a_phone_number_among_the_details_is_who_it_goes_to():
    graph = enquiries(reply=False)
    graph.steps[1].outputs.append(item("customer phone", DataType.PHONE_NUMBER))
    graph.systems.append(System(id="phone", name="WhatsApp", category=SystemCategory.CHAT))
    graph.steps.append(
        Step(id="ping", name="Message them on WhatsApp", description="Say we got it.",
             kind=StepKind.NOTIFY, system_id="phone", inputs=[item("customer phone", DataType.PHONE_NUMBER)])
    )
    graph.edges.append(Edge(from_step="log", to_step="ping"))
    ping = node(to_n8n(graph), "Message them on WhatsApp")

    assert '$("Extract enquiry details").item.json["customer phone"]' in ping["parameters"]["recipientPhoneNumber"]
    assert "Fill in the number" not in ping["notes"]


def test_a_channel_named_in_the_description_is_filled_in():
    graph = enquiries(reply=False)
    graph.systems.append(SLACK_CHAT)
    graph.steps.append(
        Step(id="tell", name="Tell the team", description="Post it in #sales-leads.",
             kind=StepKind.NOTIFY, system_id="slack")
    )
    graph.edges.append(Edge(from_step="log", to_step="tell"))

    post = node(to_n8n(graph), "Tell the team")["parameters"]
    assert post["channelId"] == {"__rl": True, "value": "#sales-leads", "mode": "name"}
    # It names no details itself, so it carries the ones worked out before it.
    assert "Preferred date:" in post["text"]


# --- What is left for the person ----------------------------------------------


def test_what_only_the_person_knows_is_left_empty_and_said_so():
    workflow = to_n8n(enquiries())
    sheet = node(workflow, "Log enquiry in Google Sheets")

    assert sheet["parameters"]["documentId"]["value"] == ""
    assert "Left to do: Pick the spreadsheet" in sheet["notes"]


def test_the_build_list_says_what_is_left_in_each_node():
    blueprint = build_blueprint(enquiries(), None)
    sheets = next(p for p in blueprint.places if p.name == "Google Sheets")

    assert "header row of customer name, customer email and preferred date" in sheets.setup
    ready = next(t for t in blueprint.tasks if t.kind == "ready")
    assert "Gmail Trigger" in ready.title
    fill = next(t for t in blueprint.tasks if t.kind == "fill")
    assert "preferred date" in fill.detail


# --- Branches -----------------------------------------------------------------


def branching(tested_second: bool) -> ProcessGraph:
    over = Threshold(field="asking_price", operator=ComparisonOperator.GT, value="1000000",
                     value_type=DataType.MONEY, currency="GBP")
    first = Edge(from_step="big", to_step="partner", condition="over a million",
                 condition_test=None if tested_second else over)
    second = Edge(from_step="big", to_step="agent", condition="a million or less",
                  condition_test=over.model_copy(update={"operator": ComparisonOperator.LTE}) if tested_second else None)
    return ProcessGraph(
        title="Valuations", summary="Big ones go to a partner.",
        trigger=Trigger(kind=TriggerKind.MANUAL, description="By hand", first_step_id="price"),
        steps=[
            Step(id="price", name="Note the asking price", description="From the listing.",
                 kind=StepKind.EXTRACT, outputs=[item("asking price", DataType.MONEY)]),
            Step(id="big", name="Is it a big one?", description="Over a million?", kind=StepKind.DECISION),
            Step(id="partner", name="Give it to a partner", description="...", kind=StepKind.JUDGEMENT),
            Step(id="agent", name="Give it to an agent", description="...", kind=StepKind.JUDGEMENT),
        ],
        edges=[Edge(from_step="price", to_step="big"), first, second],
    )


def test_a_branch_with_a_test_becomes_the_if_condition():
    workflow = to_n8n(branching(tested_second=False))
    condition = node(workflow, "Is it a big one?")["parameters"]["conditions"]["conditions"][0]

    assert condition["operator"]["operation"] == "gt"
    assert condition["rightValue"] == 1_000_000
    assert '$("Note the asking price").item.json["asking price"]' in condition["leftValue"]


def test_the_tested_branch_takes_the_ifs_true_output():
    workflow = to_n8n(branching(tested_second=True))
    outputs = workflow["connections"]["Is it a big one?"]["main"]

    assert outputs[0][0]["node"] == "Give it to an agent"
    assert outputs[1][0]["node"] == "Give it to a partner"


def within(days: int) -> Threshold:
    return Threshold(field="days until due", operator=ComparisonOperator.LTE, value=str(days),
                     value_type=DataType.NUMBER)


TWO_DAYS = within(2)


def triage(later: Threshold | None = None, soon: Threshold | None = TWO_DAYS) -> ProcessGraph:
    """Three ways out of one decision. The first is listed without a test."""

    return ProcessGraph(
        title="Invoice triage", summary="Sorted by how soon they are due.",
        trigger=Trigger(kind=TriggerKind.MANUAL, description="By hand", first_step_id="read"),
        steps=[
            Step(id="read", name="Note when it is due", description="From the invoice.",
                 kind=StepKind.EXTRACT, outputs=[item("days until due", DataType.NUMBER)]),
            Step(id="urgency", name="How urgent is it?", description="By due date.", kind=StepKind.DECISION),
            Step(id="now", name="Pay it today", description="...", kind=StepKind.JUDGEMENT),
            Step(id="week", name="Pay it this week", description="...", kind=StepKind.JUDGEMENT),
            Step(id="later", name="File it for later", description="...", kind=StepKind.JUDGEMENT),
        ],
        edges=[
            Edge(from_step="read", to_step="urgency"),
            Edge(from_step="urgency", to_step="later", condition="due later than that", condition_test=later),
            Edge(from_step="urgency", to_step="now", condition="due within 2 days", condition_test=soon),
            Edge(from_step="urgency", to_step="week", condition="due within a week", condition_test=within(7)),
        ],
    )


def test_three_ways_out_become_a_switch_with_every_branch_wired():
    """An IF has two outputs, and n8n drops a line from an output that is not there."""

    workflow = to_n8n(triage())
    switch = node(workflow, "How urgent is it?")
    outputs = workflow["connections"]["How urgent is it?"]["main"]

    assert switch["type"] == "n8n-nodes-base.switch"
    assert [o[0]["node"] for o in outputs] == ["Pay it today", "Pay it this week", "File it for later"]


def test_each_branch_with_a_test_is_a_rule_and_the_one_without_is_the_fallback():
    parameters = node(to_n8n(triage()), "How urgent is it?")["parameters"]
    rules = parameters["rules"]["values"]

    # Tried in order, so "within 2 days" gets its chance before "within a week".
    assert [r["outputKey"] for r in rules] == ["due within 2 days", "due within a week"]
    assert [r["conditions"]["conditions"][0]["rightValue"] for r in rules] == [2, 7]
    assert '$("Note when it is due").item.json["days until due"]' in rules[0]["conditions"]["conditions"][0]["leftValue"]
    assert parameters["options"] == {"fallbackOutput": "extra", "renameFallbackOutput": "due later than that"}


def test_branches_with_no_test_are_left_to_set_and_said_so():
    workflow = to_n8n(triage(soon=None))
    switch = node(workflow, "How urgent is it?")

    assert "fallbackOutput" not in switch["parameters"]["options"]
    assert '"due later than that" and "due within 2 days"' in switch["notes"]
    fill = next(t for t in build_blueprint(triage(soon=None), None).tasks if t.title == 'Finish "How urgent is it?"')
    assert "due within 2 days" in fill.detail


def test_every_branch_tested_needs_nothing_more():
    switch = node(to_n8n(triage(later=Threshold(field="days until due", operator=ComparisonOperator.GT, value="7",
                                                 value_type=DataType.NUMBER))), "How urgent is it?")
    assert len(switch["parameters"]["rules"]["values"]) == 3
    assert "Left to do" not in switch["notes"]


def test_the_build_list_calls_it_a_switch():
    branch = next(t for t in build_blueprint(triage(), None).tasks if t.kind == "branch")
    assert branch.title == "1 branch, as a Switch node"


# --- Shape --------------------------------------------------------------------


def test_every_line_runs_left_to_right():
    """Stacked in one column, every line looped back round to the next node's input."""

    workflow = to_n8n(branching(tested_second=False))
    x = {n["name"]: n["position"][0] for n in workflow["nodes"]}
    for source, connection in workflow["connections"].items():
        for output in connection["main"]:
            for target in output:
                assert x[target["node"]] > x[source]


def test_branches_sit_one_above_the_other():
    workflow = to_n8n(branching(tested_second=False))
    partner = node(workflow, "Give it to a partner")["position"]
    agent = node(workflow, "Give it to an agent")["position"]

    assert partner[0] == agent[0]
    assert partner[1] < agent[1]


CHECKED = {
    c.type: c.version
    for c in (GMAIL, GMAIL_TRIGGER, GOOGLE_SHEETS, SLACK, WHATSAPP, SEND_EMAIL, HTTP, CODE, SET)
}


@pytest.mark.parametrize("graph", [enquiries(), enquiries(trigger_in="the inbox"), branching(True)])
def test_every_node_is_at_the_version_its_parameters_were_checked_against(graph):
    for exported in to_n8n(graph)["nodes"]:
        if exported["type"] in CHECKED:
            assert exported["typeVersion"] == CHECKED[exported["type"]]


def test_a_named_api_call_asks_only_for_its_address():
    graph = branching(tested_second=False)
    graph.steps[2] = Step(id="partner", name="Send it to the CRM", description="Make an API call.",
                          kind=StepKind.WRITE, inputs=[item("asking price", DataType.MONEY)])
    plan = AutomationPlan(
        process_title="Valuations", headline="Fine.",
        assessments=[StepAssessment(step_id="partner", verdict=Verdict.FULLY_AUTOMATABLE, rationale="Fine.",
                                    confidence=Confidence.HIGH, tool=ToolMatch(capability="rest api call"))],
    )
    call = node(to_n8n(graph, plan), "Send it to the CRM")

    assert call["type"] == HTTP.type
    assert call["parameters"]["url"] == ""
    assert call["parameters"]["bodyParameters"]["parameters"][0]["name"] == "asking price"
    assert "Left to do: Fill in the address it calls" in call["notes"]
