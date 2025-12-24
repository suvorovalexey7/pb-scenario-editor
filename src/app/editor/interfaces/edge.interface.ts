import Konva from 'konva';
import { EdgeType } from '../types/edge.type';

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
  type: EdgeType;
  line: Konva.Line;
}
