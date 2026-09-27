import type { Verdict } from "../types";

// Outline icons on a 24 unit grid, drawn in the text colour. A handful, kept
// here rather than pulled from a library, because a library of thousands for
// eight shapes is weight nobody needs.
const PATHS = {
  bolt: "M13 3 5 13h6l-1 8 8-10h-6z",
  shield: "M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z M9 12l2 2 4-4",
  person: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5",
  question: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17h.01",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M9 20h6 M10 17h4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  chevron: "M9 6l6 6-6 6",
  book: "M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z M5 16a4 4 0 0 1 4-4h10",
} as const;

export type IconName = keyof typeof PATHS;

export const VERDICT_ICON: Record<Verdict, IconName> = {
  fully_automatable: "bolt",
  automatable_with_control: "shield",
  human_required: "person",
  needs_more_info: "question",
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
