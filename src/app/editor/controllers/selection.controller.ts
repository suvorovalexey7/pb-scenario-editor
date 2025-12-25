import Konva from 'konva';

export class SelectionController {
  private isSelecting = false;
  private start?: Konva.Vector2d;
  private end?: Konva.Vector2d;

  startSelection(point: Konva.Vector2d): void {
    this.isSelecting = true;
    this.start = point;
    this.end = point;
  }

  update(point: Konva.Vector2d): void {
    if (!this.isSelecting) return;
    this.end = point;
  }

  finish(): void {
    this.isSelecting = false;
    this.start = undefined;
    this.end = undefined;
  }

  isActive(): boolean {
    return this.isSelecting;
  }

  /**
   * Координаты итогового прямоугольника
   */
  getBounds():
    | { x: number; y: number; width: number; height: number }
    | null {
    if (!this.start || !this.end) return null;

    return {
      x: Math.min(this.start.x, this.end.x),
      y: Math.min(this.start.y, this.end.y),
      width: Math.abs(this.end.x - this.start.x),
      height: Math.abs(this.end.y - this.start.y),
    };
  }
}
