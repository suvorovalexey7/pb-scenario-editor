/**
 * createGridPattern
 *
 * Отвечает за генерацию canvas-паттерна сетки,
 * который затем используется как fillPatternImage в Konva.
 *
 * Область ответственности:
 * - рисование одной "ячейки" сетки (pattern-тайла)
 * - настройка толщины линий
 * - настройка цвета
 * - подготовка паттерна для бесконечной сетки
 *
 * ВАЖНО:
 * - Функция НЕ знает про Konva.Stage / Layer / Rect
 * - Она НИЧЕГО не добавляет на сцену
 * - Она НЕ занимается панорамированием или масштабированием
 *
 * EditorComponent:
 * - вызывает createGridPattern()
 * - использует результат как fillPatternImage
 * - кладёт паттерн в большой Konva.Rect
 *
 * Архитектурное решение:
 * - Логика рендеринга сетки отделена от логики редактора
 * - Сетку легко изменить (включить крупные линии, адаптивную сетку и т.д.)
 * - Можно переиспользовать в других редакторах
 *
 * Это позволяет:
 * - иметь "бесконечную" сетку без тысяч линий
 * - не пересоздавать сетку при zoom/pan
 * - минимизировать нагрузку на CPU/GPU
 *
 * Жизненный цикл:
 * - Паттерн создаётся один раз
 * - Используется как повторяющийся fill у большого прямоугольника
 * - Работает стабильно и производительно при больших сценах
 */
export function createGridPattern(
  size = 40,
  color = '#1e293b',
  thickness = 1
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, 0);
  ctx.lineTo(size, size);
  ctx.stroke();

  return canvas;
}
