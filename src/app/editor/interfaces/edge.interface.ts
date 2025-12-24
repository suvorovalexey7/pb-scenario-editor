import Konva from 'konva';

/**
 * Ребро (линия связи между нодами).
 * Содержит ссылку на Konva.Line.
*/
export interface IEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPortId: string;
  toPortId: string;
  line: Konva.Line;
}
