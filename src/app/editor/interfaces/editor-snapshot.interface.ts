import { NodeType } from '../types/node.type';

/**
 * Снапшот редактора — формат для сохранения / загрузки.
*/
export interface IEditorSnapshot {
  nodes: Array<{
    id: string;
    type: NodeType;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    fromPortId: string;
    toPortId: string;
  }>;
}
