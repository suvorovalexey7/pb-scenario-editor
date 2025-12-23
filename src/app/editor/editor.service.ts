import { Injectable } from '@angular/core';
import Konva from 'konva';

// Model: describes nodes, ports, edges and their backing Konva shapes.
export type NodeType = 'trigger' | 'action';
export type PortType = 'input' | 'output';

export interface PortModel {
  id: string;
  nodeId: string;
  type: PortType;
  circle: Konva.Circle;
}

export interface NodeModel {
  id: string;
  type: NodeType;
  group: Konva.Group;
  ports: {
    input?: PortModel;
    output?: PortModel;
  };
}

export interface EdgeModel {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPortId: string;
  toPortId: string;
  line: Konva.Line;
}

@Injectable({ providedIn: 'root' })
export class EditorService {
  readonly nodes = new Map<string, NodeModel>();
  readonly edges = new Map<string, EdgeModel>();

  addNode(node: NodeModel): void {
    this.nodes.set(node.id, node);
  }

  moveNode(nodeId: string): void {
    this.updateEdgesForNode(nodeId);
  }

  addEdge(edge: EdgeModel): void {
    this.edges.set(edge.id, edge);
  }

  updateEdgesForNode(nodeId: string): void {
    for (const edge of this.edges.values()) {
      if (edge.fromNodeId === nodeId || edge.toNodeId === nodeId) {
        this.updateEdgeGeometry(edge);
      }
    }
  }

  private updateEdgeGeometry(edge: EdgeModel): void {
    const fromPort = this.findPort(edge.fromPortId);
    const toPort = this.findPort(edge.toPortId);
    const stageTransform = edge.line.getStage()?.getAbsoluteTransform().copy();
    if (!fromPort || !toPort || !stageTransform) {
      return;
    }
    // Rendering: keep geometry in stage coordinates (not screen) so zoom/pan won't break lines.
    stageTransform.invert();
    const fromAbs = fromPort.circle.getAbsolutePosition();
    const toAbs = toPort.circle.getAbsolutePosition();
    const fromPos = stageTransform.point(fromAbs);
    const toPos = stageTransform.point(toAbs);

    edge.line.points([fromPos.x, fromPos.y, toPos.x, toPos.y]);
    edge.line.getLayer()?.batchDraw();
  }

  private findPort(portId: string): PortModel | undefined {
    for (const node of this.nodes.values()) {
      const candidate =
        node.ports.input?.id === portId
          ? node.ports.input
          : node.ports.output?.id === portId
            ? node.ports.output
            : undefined;
      if (candidate) {
        return candidate;
      }
    }
    return undefined;
  }
}

