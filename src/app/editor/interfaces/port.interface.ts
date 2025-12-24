import { PortType } from '../types/port.type';
import Konva from 'konva';


/**
 * Модель порта (точки подключения).
 * Пока содержит ссылку на Konva.Circle для вычисления геометрии.
 */
export interface IPort {
  id: string;
  nodeId: string;
  type: PortType;
  circle: Konva.Circle;
}
