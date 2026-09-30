import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

import type { StepKind, Verdict } from "../types";
import { NodeCard } from "./NodeCard";

export interface StepNodeData extends Record<string, unknown> {
  label: string;
  kind: StepKind;
  verdict: Verdict | null;
  riskCount: number;
  hasControl: boolean;
  selected: boolean;
}

export function StepNode({ data }: NodeProps) {
  const step = data as StepNodeData;

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <NodeCard
        label={step.label}
        kind={step.kind}
        verdict={step.verdict}
        hasControl={step.hasControl}
        selected={step.selected}
      />
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}
