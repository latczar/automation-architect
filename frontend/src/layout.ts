import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

// Kept in step with .node in styles.css. Dagre spaces the boxes by these
// numbers, so a node drawn wider or taller than it was told about crowds its
// neighbours and pulls the edges off centre.
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 100;

export interface Point {
  x: number;
  y: number;
}

/** The line dagre planned for an edge, and where its label goes. */
export interface Route {
  points: Point[];
  label: Point | null;
}

// Edge labels are drawn at 11px and wrap at this width, so the space reserved
// for one has to be worked out the same way.
const LABEL_WIDTH = 180;
const CHARACTER = 6.2;
const LINE = 14;

function labelSize(text: string): { width: number; height: number } {
  const lines = Math.max(1, Math.ceil((text.length * CHARACTER) / (LABEL_WIDTH - 16)));
  return {
    width: Math.min(LABEL_WIDTH, text.length * CHARACTER + 16),
    height: lines * LINE + 10,
  };
}

// React Flow positions nodes wherever you tell it to and has no opinion about
// layout, so something has to work out where they go. Dagre is the boring
// choice: it handles layering and keeps branches from crossing, which is most
// of what a process diagram needs.
//
// The routes matter as much as the positions. Dagre leaves room for each
// branch's condition and bends the line around the steps in its way, but only
// if the line is then drawn along the route it planned. React Flow's own
// curve goes straight from one handle to the other, which is how a label like
// "five thousand pounds or less" ended up on top of the step beside it.
export function layoutGraph(nodes: Node[], edges: Edge[]): { nodes: Node[]; routes: Record<string, Route> } {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 44, marginx: 16, marginy: 16 });

  nodes.forEach((node) =>
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }),
  );
  edges.forEach((edge) => {
    const text = typeof edge.label === "string" ? edge.label : "";
    graph.setEdge(
      { v: edge.source, w: edge.target, name: edge.id },
      text ? { ...labelSize(text), labelpos: "c" } : {},
    );
  });

  dagre.layout(graph);

  const routes: Record<string, Route> = {};
  edges.forEach((edge) => {
    const planned = graph.edge({ v: edge.source, w: edge.target, name: edge.id });
    if (!planned) return;
    routes[edge.id] = {
      points: planned.points ?? [],
      label: edge.label ? { x: planned.x, y: planned.y } : null,
    };
  });

  return {
    nodes: nodes.map((node) => {
      const placed = graph.node(node.id);
      return {
        ...node,
        // Dagre gives a centre point, React Flow wants a top-left corner.
        position: { x: placed.x - NODE_WIDTH / 2, y: placed.y - NODE_HEIGHT / 2 },
      };
    }),
    routes,
  };
}
