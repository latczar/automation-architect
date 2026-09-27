import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

import type { Point } from "../layout";

export interface RoutedEdgeData extends Record<string, unknown> {
  points: Point[];
  labelAt: Point | null;
}

/**
 * A curve through the points between two steps, then down into the next.
 *
 * Each stretch bends only in the middle of its height, so the line always
 * leaves one step going down and arrives at the next going down, which is how
 * a top-to-bottom process should read.
 */
function curve(points: Point[]): string {
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const middle = (a.y + b.y) / 2;
    path += ` C ${a.x} ${middle}, ${b.x} ${middle}, ${b.x} ${b.y}`;
  }
  return path;
}

/**
 * An edge drawn along the route the layout planned, with its label where the
 * layout left room for it. See layout.ts for why React Flow's own curve is not
 * used.
 */
export function RoutedEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, label, markerEnd, style } = props;
  const data = props.data as RoutedEdgeData | undefined;

  // The ends come from React Flow, which knows where the handles actually are.
  // Only the bends in between come from the plan.
  const between = (data?.points ?? []).slice(1, -1);
  const path = curve([{ x: sourceX, y: sourceY }, ...between, { x: targetX, y: targetY }]);

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label && data?.labelAt && (
        <EdgeLabelRenderer>
          <div
            className="edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${data.labelAt.x}px, ${data.labelAt.y}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
