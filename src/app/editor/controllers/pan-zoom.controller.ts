/**
 * PanZoomController
 *
 * Отвечает ТОЛЬКО за логику панорамирования и масштабирования сцены (Konva.Stage).
 *
 * Область ответственности:
 * - перемещение сцены (pan) при зажатой кнопке мыши
 * - масштабирование сцены (zoom) через колесо мыши
 * - корректный пересчёт позиции сцены относительно курсора
 *
 * ВАЖНО:
 * - Контроллер НЕ подписывается на события Konva самостоятельно
 * - Он НЕ вызывает stage.on / stage.off
 * - Все события прокидываются извне (обычно из EditorComponent)
 *
 * Архитектурное решение:
 * - EditorComponent — владелец stage и событий
 * - PanZoomController — "плоский" класс с чистой логикой
 * - Это позволяет:
 *   - избегать конфликтов с другими интеракциями (drag-edge, selection)
 *   - переиспользовать контроллер
 *   - проще тестировать логику pan/zoom
 *
 * Жизненный цикл:
 * - Создаётся вместе с EditorComponent
 * - Не требует destroy / detach
 * - Очищается автоматически при уничтожении Konva.Stage
 */
import Konva from 'konva';

export class PanZoomController {
  private isPanning = false;
  private lastPanPosition?: Konva.Vector2d;

  constructor(private readonly stage: Konva.Stage) {}

  onMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.target !== this.stage) {
      return;
    }
    this.isPanning = true;
    this.lastPanPosition = this.stage.getPointerPosition() ?? undefined;
  }

  onMouseMove(): void {
    if (!this.isPanning || !this.lastPanPosition) {
      return;
    }

    const pointer = this.stage.getPointerPosition();
    if (!pointer) {
      return;
    }

    this.stage.position({
      x: this.stage.x() + pointer.x - this.lastPanPosition.x,
      y: this.stage.y() + pointer.y - this.lastPanPosition.y,
    });

    this.lastPanPosition = pointer;
    this.stage.batchDraw();
  }

  onMouseUp(): void {
    this.isPanning = false;
    this.lastPanPosition = undefined;
  }

  onWheel(e: Konva.KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault();

    const scaleBy = 1.05;
    const oldScale = this.stage.scaleX();
    const pointer = this.stage.getPointerPosition();
    if (!pointer) {
      return;
    }

    const mousePointTo = {
      x: (pointer.x - this.stage.x()) / oldScale,
      y: (pointer.y - this.stage.y()) / oldScale,
    };

    const newScale =
      e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    this.stage.scale({ x: newScale, y: newScale });
    this.stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });

    this.stage.batchDraw();
  }
}
