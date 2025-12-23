import { Injectable } from '@angular/core';
import Konva from 'konva';

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
export class EditorStateService {
  readonly nodes = new Map<string, NodeModel>();
  readonly edges = new Map<string, EdgeModel>();

  addNode(node: NodeModel): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: EdgeModel): void {
    this.edges.set(edge.id, edge);
  }

  findPort(portId: string): PortModel | undefined {
    for (const node of this.nodes.values()) {
      if (node.ports.input?.id === portId) {
        return node.ports.input;
      }
      if (node.ports.output?.id === portId) {
        return node.ports.output;
      }
    }
    return undefined;
  }
}
