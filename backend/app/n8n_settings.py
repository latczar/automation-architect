"""What each ready-made node is set to, so it arrives filled in.

A node with nothing set opens on its default operation, and n8n's defaults are
not ours to rely on: an empty Gmail node is a send, so a step that checks the
inbox arrived asking for a subject and a message. Each node here is set to the
operation its step does, then filled in from what the process already says:
which fields a step works with, which earlier step produced them, and where an
email came from.

What only the person knows stays empty on purpose, and the node says so: which
spreadsheet, which channel, which address to send from. A guess there gives a
file that runs and does the wrong thing, which is worse than one that stops and
asks. The wording of a message is drafted from the details it carries and
marked as a draft, never written as though we knew what their business says.

Every parameter name and value below was checked against the node's source in
n8n-io/n8n, at the typeVersion n8n_catalogue pins it to.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

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
    NodeChoice,
)
from app.schemas.common import DataItem, DataType
from app.schemas.process import ProcessGraph, Step, StepKind

# What a node hands on. "email" is a whole email as Gmail parses it, "fields"
# is the named fields a step produces, and "other" is whatever an API sent back,
# which nothing later should read a field out of.
Shape = Literal["email", "fields", "other"]


@dataclass(frozen=True)
class Filled:
    """A node's parameters, and what is still the person's to do in it."""

    parameters: dict[str, Any]
    left: tuple[str, ...] = ()


@dataclass(frozen=True)
class Earlier:
    """A step that runs before this one, and the node it became."""

    step: Step
    node: str
    shape: Shape


@dataclass(frozen=True)
class Where:
    """Where a step sits in the workflow, which most of its settings depend on."""

    graph: ProcessGraph
    step: Step
    # Every step that runs before this one, nearest first.
    earlier: tuple[Earlier, ...]
    # The nearest node before this one that holds a whole email, if any.
    email: str | None


def shape_of(choice: NodeChoice | None, step: Step) -> Shape:
    if choice is GMAIL and step.kind is StepKind.READ:
        return "email"
    if choice in (SET, CODE) or (choice is None and makes_fields(step)):
        return "fields"
    if choice is GOOGLE_SHEETS and step.kind is StepKind.READ:
        # A row comes back keyed by the sheet's header row, which the node's
        # note asks to match the field names.
        return "fields"
    return "other"


def makes_fields(step: Step) -> bool:
    """A placeholder that becomes an Edit Fields node rather than a No Op.

    A step that picks details out of something, or works them out, has named
    outputs. As fields, the steps after it can map them by name, so a sheet
    row or a message is filled in before anyone has written the extraction.
    """

    return step.kind in (StepKind.EXTRACT, StepKind.TRANSFORM) and bool(step.outputs)


def fill(choice: NodeChoice | None, where: Where) -> Filled | None:
    """The parameters for one step's node, or None if it is a plain placeholder."""

    if choice is GMAIL:
        return _gmail(where)
    if choice is GOOGLE_SHEETS:
        return _sheets(where)
    if choice is SLACK:
        return _slack(where)
    if choice is WHATSAPP:
        return _whatsapp(where)
    if choice is SEND_EMAIL:
        return _send_email(where)
    if choice is HTTP:
        return _http(where)
    if choice is CODE:
        return _code(where)
    if choice is SET or (choice is None and makes_fields(where.step)):
        return _fields(where)
    return None


def fill_trigger(choice: NodeChoice) -> Filled:
    if choice is GMAIL_TRIGGER:
        # The whole email rather than the summary, because the usual next step
        # reads details out of the body, and the summary carries only its first
        # couple of hundred characters.
        return Filled(
            {
                "pollTimes": {"item": [{"mode": "everyMinute"}]},
                "simple": False,
                "filters": {"readStatus": "unread"},
                "options": {},
            },
            (
                (
                    "It starts for every new unread email. Add a search under Filters, "
                    "such as a subject or a label, so it starts only for the ones this is for."
                ),
            ),
        )
    return Filled({})


# --- Where a value comes from ------------------------------------------------


def _from(node: str | None) -> str:
    return f"$({json.dumps(node)}).item.json" if node else "$json"


def value_of(item: DataItem, where: Where) -> str | None:
    """An expression for a field this step uses, or None if nothing says.

    The nearest earlier step that produced a field of that name wins. It is
    read from that node by name rather than from whatever the step before
    handed on, because a node in between (a Gmail send, a Slack post) hands on
    its own API response, and the field would silently come through empty.
    """

    wanted = _key(item.name)
    for earlier in where.earlier:
        produced = next((o for o in earlier.step.outputs if _key(o.name) == wanted), None)
        if not produced:
            continue
        if earlier.shape == "fields":
            return f"{{{{ {_from(earlier.node)}[{json.dumps(produced.name)}] }}}}"
        if earlier.shape == "email":
            return from_email(item, earlier.node) or f"{{{{ {_from(earlier.node)}.text }}}}"

    return from_email(item, where.email) if where.email else None


PERSON = re.compile(r"\bname\b")
NOT_A_PERSON = re.compile(r"\b(company|business|property|product|file|sheet|project|account|street)\b")


def from_email(item: DataItem, node: str | None) -> str | None:
    """A field that is plainly part of the email itself: who sent it, its subject.

    Only the parts an email always has. "Preferred date" is in the body in
    somebody's own words, and pulling it out is the extraction nobody has
    written yet, so it is left for them rather than guessed at.
    """

    if not node:
        return None

    name = item.name.lower()
    email = _from(node)

    if item.data_type is DataType.EMAIL_ADDRESS or ("email" in name and "address" in name):
        return f"{{{{ {email}.from.value[0].address }}}}"
    if "subject" in name:
        return f"{{{{ {email}.subject }}}}"
    if PERSON.search(name) and not NOT_A_PERSON.search(name):
        return f"{{{{ {email}.from.value[0].name }}}}"
    if item.data_type is DataType.DATE and re.search(r"\b(received|sent|arrived)\b", name):
        return f"{{{{ {email}.date }}}}"
    if item.data_type in (DataType.TEXT, DataType.RECORD) and re.search(
        r"\b(email|message|body|text|content|enquiry|request)\b", name
    ):
        return f"{{{{ {email}.text }}}}"
    return None


def _key(name: str) -> str:
    """One spelling for a field name: "invoice_total" and "Invoice total" are one field."""

    return " ".join(re.sub(r"[._-]", " ", name.lower()).split())


def _names(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} and {items[-1]}"


def _label(name: str) -> str:
    words = " ".join(name.replace("_", " ").split())
    return words[:1].upper() + words[1:]


# The most details a drafted message carries when the step named none of its own.
CARRIED = 6


def carried(where: Where) -> list[DataItem]:
    """The details a step works with: its own inputs, or what came before it.

    "Tell accounting the invoice is in" names no details, but the total worked
    out two steps earlier is plainly what the message is about. Only fields an
    earlier node really hands on are counted, nearest first.
    """

    if where.step.inputs:
        return list(where.step.inputs)

    found: list[DataItem] = []
    seen: set[str] = set()
    for earlier in where.earlier:
        if earlier.shape != "fields":
            continue
        for item in earlier.step.outputs:
            if _key(item.name) not in seen:
                seen.add(_key(item.name))
                found.append(item)
    return found[:CARRIED]


def _details(where: Where, email: bool = False) -> tuple[list[str], list[str]]:
    """One "Label: value" line per detail the step carries, and those with no source.

    An email leaves out addresses: the one it goes to is already on it, and
    telling somebody their own address is not a detail.
    """

    lines: list[str] = []
    missing: list[str] = []
    for item in carried(where):
        if email and item.data_type is DataType.EMAIL_ADDRESS:
            continue
        value = value_of(item, where)
        if value:
            lines.append(f"{_label(item.name)}: {value}")
        else:
            missing.append(item.name)
    return lines, missing


def _missing(missing: list[str]) -> tuple[str, ...]:
    if not missing:
        return ()
    return (f"Nothing earlier produces {_names(missing)}, so fill in where it comes from.",)


# --- Gmail --------------------------------------------------------------------

REPLY = re.compile(r"\b(reply|replies|respond|responds|answer|get back)\b")
SENDS = re.compile(r"\b(send|sends|sent|email|emails|forward|forwards|reply|replies|respond|tell|notify|confirm)\b")

# Things a step does to an email already in the inbox. Checked before sending,
# because "archive the email" has the word email in it and is not a send.
MARK_READ = re.compile(r"\bmark(s|ed)?\b.*\bread\b")
PUT_AWAY = re.compile(r"\b(archive[sd]?|archiving|delete[sd]?|deleting|bin|trash)\b")
DELETES = re.compile(r"\b(delete[sd]?|deleting|bin|trash)\b")
LABEL = re.compile(r"\b(label(s|led)?|tag(s|ged)?|folder)\b")
ATTACHMENT = re.compile(r"\battachments?\b")


def _in_the_inbox(text: str, where: Where) -> Filled | None:
    """A Gmail step that changes an email rather than sending one, or None.

    Left unset, any of these opened as a send, and a step meant to tidy the
    inbox would have emailed somebody instead.
    """

    email = f"={{{{ {_from(where.email)}.id }}}}" if where.email else ""
    left: list[str] = [] if where.email else ["Fill in which email it acts on."]

    def done(operation: str, **extra: Any) -> Filled:
        return Filled({"resource": "message", "operation": operation, "messageId": email, **extra}, tuple(left))

    if MARK_READ.search(text):
        return done("markAsRead")
    if PUT_AWAY.search(text):
        # Archived, never deleted: Gmail's delete skips the bin, and nothing
        # gets it back. Somebody who wants that can choose it knowing so.
        if DELETES.search(text):
            left.append(
                "It archives the email rather than deleting it, because a deleted email "
                "cannot be got back. Switch the operation to Delete if you want it gone for good."
            )
        return done("removeLabels", labelIds=["INBOX"])
    if LABEL.search(text):
        left.append("Pick the label.")
        return done("addLabels", labelIds=[])
    if ATTACHMENT.search(text):
        return done("get", simple=False, options={"downloadAttachments": True})
    return None
SENDER = re.compile(r"\b(customer|client|sender|applicant|enquirer|tenant|buyer|vendor|landlord)s?\b")
DRAFTED = "Read the drafted message and put it in your own words before switching it on."


def _gmail(where: Where) -> Filled:
    step = where.step
    text = f"{step.name} {step.description}".lower()

    if step.kind is StepKind.READ:
        if where.email:
            # The email that started this, fetched whole by its id.
            return Filled(
                {
                    "resource": "message",
                    "operation": "get",
                    "messageId": f"={{{{ {_from(where.email)}.id }}}}",
                    "simple": False,
                    "options": {},
                }
            )
        return Filled(
            {
                "resource": "message",
                "operation": "getAll",
                "limit": 10,
                "simple": False,
                "filters": {"readStatus": "unread"},
                "options": {},
            },
            (
                (
                    "It picks up unread emails each run. Add a search under Filters so it "
                    "picks up only the ones this is for, and mark each one read once it is handled."
                ),
            ),
        )

    if step.kind is StepKind.WRITE:
        if changed := _in_the_inbox(text, where):
            return changed
        if not SENDS.search(text):
            # Nothing says what it does to the inbox, and a send is the one
            # guess that can reach somebody else. Fetching changes nothing.
            return Filled(
                {
                    "resource": "message",
                    "operation": "get",
                    "messageId": f"={{{{ {_from(where.email)}.id }}}}" if where.email else "",
                    "simple": False,
                    "options": {},
                },
                (
                    "Set the operation this step needs. It fetches the email for now, which changes nothing.",
                    *(() if where.email else ("Fill in which email it acts on.",)),
                ),
            )

    lines, missing = _details(where, email=True)
    message = "=Hello,\n\n" + "\n".join(lines) if lines else ""
    left = [DRAFTED if message else "Write the message."]

    if where.email and REPLY.search(text):
        # A reply goes to whoever wrote in, so a name among its details is
        # theirs, and opens the message rather than sitting in a list.
        person = next(
            (i for i in carried(where) if PERSON.search(i.name.lower()) and not NOT_A_PERSON.search(i.name.lower())),
            None,
        )
        name = value_of(person, where) if person else None
        if name:
            rest = [line for line in lines if not line.startswith(f"{_label(person.name)}: ")]
            message = f"=Hello {name},\n\n" + "\n".join(rest) if rest else f"=Hello {name},\n\n"
        return Filled(
            {
                "resource": "message",
                "operation": "reply",
                "messageId": f"={{{{ {_from(where.email)}.id }}}}",
                "emailType": "text",
                "message": message,
                "options": {"appendAttribution": False},
            },
            (*left, *_missing(missing)),
        )

    address = next(
        (value_of(i, where) for i in carried(where) if i.data_type is DataType.EMAIL_ADDRESS), None
    )
    if not address and where.email and SENDER.search(text):
        address = f"{{{{ {_from(where.email)}.from.value[0].address }}}}"
    if not address:
        left.insert(0, "Fill in who it goes to.")

    return Filled(
        {
            "resource": "message",
            "operation": "send",
            "sendTo": f"={address}" if address else "",
            "subject": where.graph.title,
            "emailType": "text",
            "message": message,
            "options": {"appendAttribution": False},
        },
        (*left, *_missing(missing)),
    )


# --- Google Sheets ------------------------------------------------------------


def _pick() -> dict[str, Any]:
    """An empty "choose from the list" box, which fills once signed in."""

    return {"__rl": True, "value": "", "mode": "list"}


# The tab every new Google spreadsheet starts with. Naming one matters more than
# it looks: n8n hides a Sheets node's columns until a tab is chosen, and on
# paste it drops whatever was set in a part it is hiding, mapping included.
FIRST_TAB = "Sheet1"


def _tab() -> dict[str, Any]:
    return {"__rl": True, "value": FIRST_TAB, "mode": "name"}


def _columns(where: Where) -> tuple[dict[str, Any], list[str]]:
    """The row to write, one column per detail the step carries.

    Mapped column by column rather than left to match up on its own, so a
    field from three steps back arrives in the right column however many nodes
    ran in between.
    """

    inputs = carried(where)
    if not inputs:
        return {"mappingMode": "autoMapInputData", "value": {}, "matchingColumns": [], "schema": []}, []

    value: dict[str, str] = {}
    missing: list[str] = []
    for item in inputs:
        found = value_of(item, where)
        value[item.name] = f"={found}" if found else ""
        if not found:
            missing.append(item.name)

    schema = [
        {
            "id": item.name,
            "displayName": item.name,
            "required": False,
            "defaultMatch": False,
            "display": True,
            "type": "string",
            "canBeUsedToMatch": True,
        }
        for item in inputs
    ]
    return {"mappingMode": "defineBelow", "value": value, "matchingColumns": [], "schema": schema}, missing


def _sheets(where: Where) -> Filled:
    step = where.step
    pick = (
        f"Pick the spreadsheet. It uses the tab called {FIRST_TAB}, the first tab of any new "
        "spreadsheet, so pick another if yours is called something else."
    )

    if step.kind is StepKind.READ:
        left = [pick]
        if step.outputs:
            left.append(
                f"Its header row should name the columns the later steps use: "
                f"{_names([o.name for o in step.outputs])}."
            )
        return Filled(
            {
                "resource": "sheet",
                "operation": "read",
                "documentId": _pick(),
                "sheetName": _tab(),
                "options": {},
            },
            tuple(left),
        )

    columns, missing = _columns(where)
    left = [pick]
    if columns["schema"]:
        left.append(f"Give the sheet a header row of {_names([c['id'] for c in columns['schema']])}.")
    if step.kind is StepKind.TRANSFORM:
        left.append("Pick the column that finds the row to change.")
    left.extend(_missing(missing))

    return Filled(
        {
            "resource": "sheet",
            "operation": "update" if step.kind is StepKind.TRANSFORM else "append",
            "documentId": _pick(),
            "sheetName": _tab(),
            "columns": columns,
            "options": {},
        },
        tuple(left),
    )


# --- Slack --------------------------------------------------------------------

CHANNEL = re.compile(r"#([a-z0-9][a-z0-9_-]{1,79})")


def _slack(where: Where) -> Filled:
    step = where.step
    system = next((s for s in where.graph.systems if s.id == step.system_id), None)
    named = CHANNEL.search(" ".join([step.name, step.description, (system.notes or "") if system else ""]).lower())

    lines, missing = _details(where)
    text = f"=*{where.graph.title}*\n" + "\n".join(lines) if lines else ""

    left = [] if named else ["Pick the channel."]
    left.append(DRAFTED if text else "Write the message.")

    return Filled(
        {
            "resource": "message",
            "operation": "post",
            "select": "channel",
            "channelId": (
                {"__rl": True, "value": f"#{named.group(1)}", "mode": "name"} if named else _pick()
            ),
            "text": text,
            "otherOptions": {"includeLinkToWorkflow": False},
        },
        (*left, *_missing(missing)),
    )


# --- WhatsApp -----------------------------------------------------------------


def _whatsapp(where: Where) -> Filled:
    """A plain text message from a WhatsApp Business number.

    An empty WhatsApp node opens on sending a template, which needs one
    approved by Meta first. A plain message needs nothing approved, but only
    reaches somebody who has messaged the business number in the last day,
    and the note says so rather than leave it to be found out.
    """

    lines, missing = _details(where)
    text = f"=*{where.graph.title}*\n" + "\n".join(lines) if lines else ""

    number = next(
        (value_of(i, where) for i in carried(where) if i.data_type is DataType.PHONE_NUMBER), None
    )
    left = ["Pick the business number it sends from."]
    if not number:
        left.append("Fill in the number it goes to, with the country code, such as 44 for the UK.")
    left.append(DRAFTED if text else "Write the message.")
    left.append(
        "A plain message only reaches somebody who has messaged your business number in "
        "the last 24 hours. For anyone else, switch it to Send Template and use one Meta has approved."
    )

    return Filled(
        {
            "resource": "message",
            "operation": "send",
            "phoneNumberId": "",
            "recipientPhoneNumber": f"={number}" if number else "",
            "messageType": "text",
            "textBody": text,
            "additionalFields": {},
        },
        (*left, *_missing(missing)),
    )


# --- Send Email ---------------------------------------------------------------


def _send_email(where: Where) -> Filled:
    lines, missing = _details(where, email=True)
    text = "=Hello,\n\n" + "\n".join(lines) if lines else ""

    address = next(
        (value_of(i, where) for i in carried(where) if i.data_type is DataType.EMAIL_ADDRESS), None
    )
    left = ["Fill in the address it sends from."]
    if not address:
        left.append("Fill in who it goes to.")
    left.append(DRAFTED if text else "Write the message.")

    return Filled(
        {
            "fromEmail": "",
            "toEmail": f"={address}" if address else "",
            "subject": where.graph.title,
            "emailFormat": "text",
            "text": text,
            "options": {"appendAttribution": False},
        },
        (*left, *_missing(missing)),
    )


# --- HTTP Request -------------------------------------------------------------


def _http(where: Where) -> Filled:
    step = where.step
    parameters: dict[str, Any] = {
        "method": "GET" if step.kind is StepKind.READ else "POST",
        "url": "",
        "options": {},
    }

    missing: list[str] = []
    if step.kind is not StepKind.READ and carried(where):
        body = []
        for item in carried(where):
            found = value_of(item, where)
            body.append({"name": item.name, "value": f"={found}" if found else ""})
            if not found:
                missing.append(item.name)
        parameters.update(
            {
                "sendBody": True,
                "contentType": "json",
                "specifyBody": "keypair",
                "bodyParameters": {"parameters": body},
            }
        )

    return Filled(
        parameters,
        ("Fill in the address it calls, and how it signs in.", *_missing(missing)),
    )


# --- Code and Edit Fields -----------------------------------------------------


def _comment(text: str) -> str:
    return " ".join(text.split())


def _code(where: Where) -> Filled:
    step = where.step
    fields = "".join(f"    {json.dumps(o.name)}: null,\n" for o in step.outputs)
    code = (
        f"// {_comment(step.name)}\n"
        f"// {_comment(step.description)}\n"
        "// Work out each field below from the item it is given.\n"
        "return $input.all().map((item) => ({\n"
        "  json: {\n"
        "    ...item.json,\n"
        f"{fields}"
        "  },\n"
        "}));\n"
    )
    return Filled(
        {"mode": "runOnceForAllItems", "language": "javaScript", "jsCode": code},
        ("Write how each field is worked out.",),
    )


def _fields(where: Where) -> Filled:
    step = where.step
    assignments = []
    empty: list[str] = []
    for index, item in enumerate(step.outputs):
        value = from_email(item, where.email) if step.kind is StepKind.EXTRACT else None
        assignments.append(
            {
                "id": f"{step.id}-{index}",
                "name": item.name,
                "value": f"={value}" if value else "",
                "type": "string",
            }
        )
        if not value:
            empty.append(item.name)

    if not empty:
        left = ("Check each field picks up the right part of the email.",)
    elif step.kind is StepKind.EXTRACT:
        one = len(empty) == 1
        left = (
            (
                f"Fill in where {_names(empty)} {'comes' if one else 'come'} from. An AI node "
                f"such as Information Extractor can read {'it' if one else 'them'} out of the text instead."
            ),
        )
    else:
        left = (f"Fill in how {_names(empty)} {'is' if len(empty) == 1 else 'are'} worked out.",)

    return Filled(
        {
            "mode": "manual",
            "assignments": {"assignments": assignments},
            "includeOtherFields": False,
            "options": {},
        },
        left,
    )
