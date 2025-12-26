/**
 * MultiDragController
 *
 * Отвечает ТОЛЬКО за бизнес-логику множественного перемещения нод.
 *
 * Область ответственности:
 * - определяет, какие ноды участвуют в общем перемещении
 * - запоминает их стартовые позиции
 * - вычисляет смещение относительно "ведущей" (master) ноды
 * - возвращает новые координаты всех нод при dragmove
 *
 * ВАЖНО:
 * - Контроллер НЕ знает про Konva.Stage / Layer / Group
 * - Он НЕ подписывается на события сам
 * - Он НЕ управляет отрисовкой
 * - Он НЕ хранит EditorState и не мутирует его
 *
 * EditorComponent:
 * - прокидывает dragstart / dragmove / dragend
 * - применяет рассчитанные позиции к Konva.Group
 * - отдельно обновляет рёбра
 *
 * Архитектурное решение:
 * - MultiDragController — "плоский" класс с чистой интеракционной логикой
 * - Логика selection остаётся в EditorStateService
 * - Логика рендера остаётся в EditorComponent
 * - Логика multi-drag изолирована и легко масштабируется
 *
 * Это позволяет:
 * - не засорять EditorState временными runtime-состояниями
 * - избежать конфликтов с другими интеракциями (pan/zoom, edge-drag)
 * - удобно расширять: snap-to-grid, constraints, групповые блоки и т.д.
 * - проще тестировать и отлаживать поведение multi-drag
 *
 * Жизненный цикл:
 * - создаётся вместе с EditorComponent
 * - живёт, пока живёт редактор
 * - очищает своё состояние после dragend
 */
export class MultiDragController {
  private initialPositions?: Map<string, { x: number; y: number }>;
  private masterId?: string;

  beginDrag(masterId: string, ids: string[], getPosition: (id: string) => { x: number; y: number }): void {
    this.masterId = masterId;
    this.initialPositions = new Map();

    ids.forEach(id => {
      this.initialPositions!.set(id, getPosition(id));
    });
  }

  apply(masterCurrent: { x: number; y: number }): Map<string, { x: number; y: number }> {
    if (!this.initialPositions || !this.masterId) return new Map();

    const masterInitial = this.initialPositions.get(this.masterId);
    if (!masterInitial) return new Map();

    const dx = masterCurrent.x - masterInitial.x;
    const dy = masterCurrent.y - masterInitial.y;

    const result = new Map<string, { x: number; y: number }>();

    for (const [id, start] of this.initialPositions.entries()) {
      result.set(id, {
        x: start.x + dx,
        y: start.y + dy,
      });
    }

    return result;
  }

  end(): void {
    this.initialPositions = undefined;
    this.masterId = undefined;
  }
}
