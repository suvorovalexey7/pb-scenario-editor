import { IPort } from '../interfaces/port.interface';

/**
 * EdgeInteractionController
 *
 * Отвечает ТОЛЬКО за бизнес-логику drag-edge (соединения нод).
 *
 * Зона ответственности:
 * - хранит состояние перетаскивания линии
 * - знает, из какого output-порта тянем
 * - знает, над каким input-портом сейчас hover
 * - решает, можно ли создать edge
 *
 * НЕ ЗНАЕТ:
 * - про Konva.Stage
 * - про Konva.Line
 * - про слои
 * - про рендер
 *
 * EditorComponent:
 * - прокидывает события
 * - рисует временную и финальную линию
 * - вызывает методы контроллера
 */
export class EdgeInteractionController {
  private activeOutput?: IPort;
  private hoveredInput?: IPort;

  /**
   * Начало drag-edge из output-порта
   */
  startDrag(output: IPort): void {
    this.activeOutput = output;
  }

  /**
   * Обновление hover-состояния input-порта
   */
  setHoveredInput(port?: IPort): void {
    this.hoveredInput = port;
  }

  /**
   * Активен ли сейчас drag-edge
   */
  isDragging(): boolean {
    return !!this.activeOutput;
  }

  /**
   * Текущий output-порт
   */
  getActiveOutput(): IPort | undefined {
    return this.activeOutput;
  }

  /**
   * Завершение drag-edge.
   *
   * Если соединение валидно — возвращает данные для создания edge.
   * Если нет — null.
   */
  finishDrag():
    | { from: IPort; to: IPort }
    | null {
    if (
      this.activeOutput &&
      this.hoveredInput &&
      this.canConnect(this.activeOutput, this.hoveredInput)
    ) {
      const result = {
        from: this.activeOutput,
        to: this.hoveredInput,
      };

      this.reset();
      return result;
    }

    this.reset();
    return null;
  }

  /**
   * Сброс состояния (cancel / mouseup вне input)
   */
  reset(): void {
    this.activeOutput = undefined;
    this.hoveredInput = undefined;
  }

  /**
   * Бизнес-правила соединения портов
   */
  private canConnect(from: IPort, to: IPort): boolean {
    // нельзя соединять ноду саму с собой
    if (from.nodeId === to.nodeId) {
      return false;
    }

    // строго output -> input
    if (from.type !== 'output' || to.type !== 'input') {
      return false;
    }

    return true;
  }
}
