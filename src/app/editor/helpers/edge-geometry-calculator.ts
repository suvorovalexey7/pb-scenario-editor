
import Konva from 'konva';
import { EdgeType } from '../types/edge.type';

export interface EdgeGeometryInput {
  from: Konva.Vector2d;
  to: Konva.Vector2d;
  type: EdgeType;
}

export class EdgeGeometryCalculator {
  static calculate(input: EdgeGeometryInput): number[] {
    switch (input.type) {
      case 'bezier':
        return this.bezier(input.from, input.to);

      case 'straight':
      default:
        return this.straight(input.from, input.to);
    }
  }

  private static straight(
    from: Konva.Vector2d,
    to: Konva.Vector2d,
  ): number[] {
    return [from.x, from.y, to.x, to.y];
  }

  private static bezier(
    from: Konva.Vector2d,
    to: Konva.Vector2d,
  ): number[] {
    const dx = Math.abs(to.x - from.x);
    const controlOffset = Math.max(dx * 0.5, 80);

    const c1 = {
      x: from.x + controlOffset,
      y: from.y,
    };

    const c2 = {
      x: to.x - controlOffset,
      y: to.y,
    };

    return [
      from.x, from.y,
      c1.x, c1.y,
      c2.x, c2.y,
      to.x, to.y,
    ];
  }
}
