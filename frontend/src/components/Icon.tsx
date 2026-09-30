import {
  IconBell,
  IconBolt,
  IconBox,
  IconBrandAirtable,
  IconBrandAsana,
  IconBrandDiscord,
  IconBrandDropbox,
  IconBrandGithub,
  IconBrandGmail,
  IconBrandGoogleDrive,
  IconBrandNotion,
  IconBrandPaypal,
  IconBrandSlack,
  IconBrandStripe,
  IconBrandTeams,
  IconBrandTelegram,
  IconBrandTrello,
  IconBrandWhatsapp,
  IconBrandZoom,
  IconCalculator,
  IconCalendarEvent,
  IconClipboardCopy,
  IconCreditCard,
  IconDatabase,
  IconDeviceMobile,
  IconEye,
  IconFileSpreadsheet,
  IconFileText,
  IconFlask,
  IconFolder,
  IconForms,
  IconGitBranch,
  IconHandClick,
  IconHelpCircle,
  IconHourglass,
  IconListCheck,
  IconMail,
  IconMessageCircle,
  IconMessageQuestion,
  IconPencil,
  IconPlug,
  IconScan,
  IconShieldCheck,
  IconSitemap,
  IconSparkles,
  IconTransform,
  IconUser,
  IconUserCheck,
  IconUsers,
  IconWorld,
  type TablerIcon,
} from "@tabler/icons-react";

import type { StepKind, Task, Verdict } from "../types";

// Tabler, the icon set Mantine's own docs use: one stroke width and one grid,
// so a verdict, a step and a system all look like they belong together.

export const VERDICT_ICON: Record<Verdict, TablerIcon> = {
  fully_automatable: IconBolt,
  automatable_with_control: IconShieldCheck,
  human_required: IconUser,
  needs_more_info: IconHelpCircle,
};

/** What a step does, drawn, so the map can be read before its words are. */
export const KIND_ICON: Record<StepKind, TablerIcon> = {
  read: IconEye,
  extract: IconScan,
  transform: IconTransform,
  decision: IconGitBranch,
  write: IconPencil,
  notify: IconBell,
  judgement: IconUserCheck,
  wait: IconHourglass,
};

/** The kind of system, for when the name is not one we have a logo for. */
export const CATEGORY_ICON: Record<string, TablerIcon> = {
  email: IconMail,
  spreadsheet: IconFileSpreadsheet,
  database: IconDatabase,
  crm: IconUsers,
  chat: IconMessageCircle,
  calendar: IconCalendarEvent,
  file_storage: IconFolder,
  accounting: IconCalculator,
  forms: IconForms,
  website: IconWorld,
  phone_or_sms: IconDeviceMobile,
  payments: IconCreditCard,
  paper_or_offline: IconFileText,
  internal_tool: IconBox,
  other: IconBox,
};

// A product somebody named gets its own mark, because a logo is recognised
// faster than a word is read. Matched on the whole word, so "Slack" finds the
// Slack mark and "slackening" finds nothing.
const BRANDS: [RegExp, TablerIcon][] = [
  [/\bslack\b/i, IconBrandSlack],
  [/\bgmail\b/i, IconBrandGmail],
  [/\bgoogle drive\b/i, IconBrandGoogleDrive],
  [/\bnotion\b/i, IconBrandNotion],
  [/\bstripe\b/i, IconBrandStripe],
  [/\btrello\b/i, IconBrandTrello],
  [/\b(microsoft )?teams\b/i, IconBrandTeams],
  [/\bpaypal\b/i, IconBrandPaypal],
  [/\basana\b/i, IconBrandAsana],
  [/\bairtable\b/i, IconBrandAirtable],
  [/\bzoom\b/i, IconBrandZoom],
  [/\bwhatsapp\b/i, IconBrandWhatsapp],
  [/\bdiscord\b/i, IconBrandDiscord],
  [/\btelegram\b/i, IconBrandTelegram],
  [/\bdropbox\b/i, IconBrandDropbox],
  [/\bgithub\b/i, IconBrandGithub],
];

export function systemIcon(name: string, category: string): TablerIcon {
  return BRANDS.find(([pattern]) => pattern.test(name))?.[1] ?? CATEGORY_ICON[category] ?? IconBox;
}

/** One icon per sort of task on the checklist. */
export const TASK_ICON: Record<Task["kind"], TablerIcon> = {
  steps: IconListCheck,
  branch: IconGitBranch,
  pause: IconHourglass,
  limit: IconShieldCheck,
  ready: IconSparkles,
  questions: IconMessageQuestion,
  copy: IconClipboardCopy,
  connect: IconPlug,
  choose: IconHandClick,
  fill: IconPencil,
  approve: IconUserCheck,
  person: IconUser,
  unclear: IconHelpCircle,
  test: IconFlask,
};

/** The mark: a process drawn as a tree of steps. */
export const BRAND_ICON = IconSitemap;
