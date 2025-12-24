import { NodeType } from '../types/node.type';
import Konva from 'konva';
import { IPort } from './port.interface';

/**
 * Модель ноды (блока).
 * Содержит Konva.Group, в котором отрисована карточка ноды.
 */
export interface INode {
  id: string;
  type: NodeType;
  group: Konva.Group;
  ports: {
    input?: IPort;
    output?: IPort;
  };
}
