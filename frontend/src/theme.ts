import { createTheme, type MantineColorsTuple } from "@mantine/core";

// Ten shades each, lightest first, the way Mantine wants a colour. Shade 8 is
// the one filled buttons and text use, so each is picked to read on white.

// The brand green, which the page has always used for anything you can press.
const forest: MantineColorsTuple = [
  "#ecf5f1",
  "#d9ebe3",
  "#b0d5c6",
  "#85bfa7",
  "#62ab8d",
  "#4c9e7c",
  "#3f8a6c",
  "#33735a",
  "#2f5d50",
  "#23473d",
];

// One colour per verdict, and the same one wherever that verdict appears:
// the key, the map, the list, the checklist. Automated steps share the brand
// green, steps needing approval get the one warning colour, and the rest stay
// neutral, so the page has a single accent.
const runs = forest;

const guard: MantineColorsTuple = [
  "#fff8e1",
  "#ffecb3",
  "#ffe082",
  "#ffd54f",
  "#ffca28",
  "#f5b50a",
  "#e09b00",
  "#c27c00",
  "#9a5b00",
  "#7a4700",
];

const human: MantineColorsTuple = [
  "#f1f3f6",
  "#e3e7ed",
  "#c9d0da",
  "#aab4c2",
  "#8e99a9",
  "#7a8596",
  "#677285",
  "#566174",
  "#475164",
  "#383f4e",
];

const SANS = '"Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  primaryColor: "forest",
  primaryShade: 8,
  colors: { forest, runs, guard, human },
  fontFamily: SANS,
  fontFamilyMonospace: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
  headings: { fontFamily: SANS, fontWeight: "650" },
  defaultRadius: "md",
  cursorType: "pointer",
  components: {
    Badge: { defaultProps: { radius: "sm" }, styles: { root: { textTransform: "none", fontWeight: 500 } } },
    Tooltip: { defaultProps: { withArrow: true, openDelay: 250, multiline: true, maw: 260 } },
  },
});
