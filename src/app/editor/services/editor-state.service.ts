import { Injectable } from '@angular/core';
import { IEditorSnapshot } from '../interfaces/editor-snapshot.interface';
import { IEdge } from '../interfaces/edge.interface';
import { INode } from '../interfaces/node.interface';
import { IPort } from '../interfaces/port.interface';

@Injectable({ providedIn: 'root' })
export class EditorStateService {
  /**
   * Хранилище всех нод редактора.
   * key = nodeId
   */
  readonly nodes = new Map<string, INode>();

  /**
   * Хранилище всех рёбер редактора.
   * key = edgeId
   */
  readonly edges = new Map<string, IEdge>();

  /**
   * Делает ноду известной редактору.
   * Ничего не рисует, только кладёт её в state.
   */
  addNode(node: INode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Делает ребро известным редактору.
   * Отрисовка линии происходит в компоненте.
   */
  addEdge(edge: IEdge): void {
    this.edges.set(edge.id, edge);
  }

  /**
   * Поиск порта по его id.
   *
   * Используется для:
   * - пересчёта геометрии линий
   * - сопоставления portId → Konva.Circle
   */
  findPort(portId: string): IPort | undefined {
    for (const node of this.nodes.values()) {
      const all = [
        ...node.ports.inputs,
        ...node.ports.outputs,
      ];

      const found = all.find(p => p.id === portId);
      if (found) return found;
    }

    return undefined;
  }

  /**
   * Полностью очищает состояние редактора.
   *
   * ВАЖНО:
   * - НЕ уничтожает Konva-объекты
   * - очистка визуальных элементов — ответственность компонента
   */
  clear(): void {
    this.edges.clear();
    this.nodes.clear();
  }

  /**
   * Экспорт текущего состояния редактора в снапшот.
   *
   * Используется для:
   * - сохранения на бэкенд
   * - автосейва
   * - undo/redo (в будущем)
   */
  exportSnapshot(): IEditorSnapshot {
    const nodes = Array.from(this.nodes.values()).map((node) => ({
      id: node.id,
      type: node.type,
      position: {
        x: node.group.x(),
        y: node.group.y(),
      },
    }));

    const edges = Array.from(this.edges.values()).map((edge) => ({
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      fromPortId: edge.fromPortId,
      toPortId: edge.toPortId,
    }));

    return { nodes, edges };
  }

  /**
   * Загрузка снапшота в состояние редактора.
   *
   * ВАЖНО:
   * - метод работает ТОЛЬКО с данными
   * - НЕ создаёт Konva-ноды и линии
   *
   * Ожидаемый сценарий:
   * 1) компонент очищает UI
   * 2) вызывает loadSnapshot
   * 3) по snapshot.nodes / snapshot.edges пересоздаёт визуальные элементы
   */
  loadSnapshot(snapshot: IEditorSnapshot): void {
    // Очищаем текущее состояние
    this.clear();

    // На текущем этапе здесь больше ничего не делаем,
    // так как NodeModel / EdgeModel требуют Konva-объекты.
    //
    // В будущем, когда state станет чистым (без Konva),
    // здесь будет полноценное восстановление.
    void snapshot;
  }
}
