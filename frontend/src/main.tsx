import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";

import "./layers.css";
// Served from this site rather than a font service, so opening the page asks
// nobody else for anything.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
// Only the parts in use. The whole Mantine stylesheet is 270KB of CSS for
// components this page never draws.
import "@mantine/core/styles/default-css-variables.layer.css";
import "@mantine/core/styles/baseline.layer.css";
import "@mantine/core/styles/global.layer.css";
import "@mantine/core/styles/UnstyledButton.layer.css";
import "@mantine/core/styles/Button.layer.css";
import "@mantine/core/styles/ActionIcon.layer.css";
import "@mantine/core/styles/Badge.layer.css";
import "@mantine/core/styles/ThemeIcon.layer.css";
import "@mantine/core/styles/Tabs.layer.css";
import "@mantine/core/styles/RingProgress.layer.css";
import "@mantine/core/styles/Progress.layer.css";
import "@mantine/core/styles/Checkbox.layer.css";
import "@mantine/core/styles/CheckboxIndicator.layer.css";
import "@mantine/core/styles/InlineInput.layer.css";
import "@mantine/core/styles/Switch.layer.css";
import "@mantine/core/styles/Chip.layer.css";
import "@mantine/core/styles/SegmentedControl.layer.css";
import "@mantine/core/styles/Input.layer.css";
import "@mantine/core/styles/Tooltip.layer.css";
import "@mantine/core/styles/Popover.layer.css";
import "@mantine/core/styles/Kbd.layer.css";
import "@mantine/core/styles/Loader.layer.css";
import "./styles.css";

import App from "./App";
import { theme } from "./theme";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Light only, as index.html says: a demo seen once should look as designed. */}
    <MantineProvider theme={theme} forceColorScheme="light">
      <App />
    </MantineProvider>
  </StrictMode>,
);
