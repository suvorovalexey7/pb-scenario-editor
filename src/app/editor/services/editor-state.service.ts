import { Injectable } from '@angular/core';
import Konva from 'konva';

/**
 * ТЕКУЩИЙ ЭТАП:
 *
 * - Сервис хранит состояние редактора в памяти.
 * - Пока что он содержит ссылки на Konva-объекты (Group / Circle / Line),
 *   так как рендер напрямую связан с состоянием.
 * - Это осознанное временное решение.
 *
 * Следующий этап рефакторинга:
 * - вынести Konva из state
 * - оставить здесь только domain-данные
 */

export type NodeType = 'trigger' | 'action';
export type PortType = 'input' | 'output';

/**
 * Модель порта (точки подключения).
 * Пока содержит ссылку на Konva.Circle для вычисления геометрии.
 */
export interface PortModel {
  id: string;
  nodeId: string;
  type: PortType;
  circle: Konva.Circle;
}

/**
 * Модель ноды (блока).
 * Содержит Konva.Group, в котором отрисована карточка ноды.
 */
export interface NodeModel {
  id: string;
  type: NodeType;
  group: Konva.Group;
  ports: {
    input?: PortModel;
    output?: PortModel;
  };
}

/**
 * Модель ребра (линии связи между нодами).
 * Содержит ссылку на Konva.Line.
 */
export interface EdgeModel {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPortId: string;
  toPortId: string;
  line: Konva.Line;
}

/**
 * Снапшот редактора — формат для сохранения / загрузки.
 *
 * ВАЖНО:
 * - здесь НЕТ Konva
 * - только данные, необходимые для восстановления схемы
 */
export interface EditorSnapshot {
  nodes: Array<{
    id: string;
    type: NodeType;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    fromPortId: string;
    toPortId: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class EditorStateService {
  /**
   * Хранилище всех нод редактора.
   * key = nodeId
   */
  readonly nodes = new Map<string, NodeModel>();

  /**
   * Хранилище всех рёбер редактора.
   * key = edgeId
   */
  readonly edges = new Map<string, EdgeModel>();

  /**
   * Делает ноду известной редактору.
   * Ничего не рисует, только кладёт её в state.
   */
  addNode(node: NodeModel): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Делает ребро известным редактору.
   * Отрисовка линии происходит в компоненте.
   */
  addEdge(edge: EdgeModel): void {
    this.edges.set(edge.id, edge);
  }

  /**
   * Поиск порта по его id.
   *
   * Используется для:
   * - пересчёта геометрии линий
   * - сопоставления portId → Konva.Circle
   */
  findPort(portId: string): PortModel | undefined {
    for (const node of this.nodes.values()) {
      if (node.ports.input?.id === portId) {
        return node.ports.input;
      }
      if (node.ports.output?.id === portId) {
        return node.ports.output;
      }
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
  exportSnapshot(): EditorSnapshot {
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
  loadSnapshot(snapshot: EditorSnapshot): void {
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
