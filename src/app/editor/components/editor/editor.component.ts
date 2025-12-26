import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import Konva from 'konva';

import { EditorStateService } from '../../services/editor-state.service';
import { PanZoomController } from '../../controllers/pan-zoom.controller';
import { EdgeInteractionController } from '../../controllers/edge-interaction.controller';

import { IEditorSnapshot } from '../../interfaces/editor-snapshot.interface';
import { IEdge } from '../../interfaces/edge.interface';
import { INode } from '../../interfaces/node.interface';
import { IPort } from '../../interfaces/port.interface';

import { NodeType } from '../../types/node.type';
import { PortType } from '../../types/port.type';
import { EdgeGeometryCalculator } from '../../helpers/edge-geometry-calculator';
import { SelectionController } from '../../controllers/selection.controller';
import { UndoRedoService } from '../../services/undo-redo.service';
import { AsyncPipe } from '@angular/common';
import { MultiDragController } from '../../controllers/multi-drag.controller';
import { createGridPattern } from '../../helpers/grid-pattern';

@Component({
  selector: 'app-editor',
  standalone: true,
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe
  ]
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private stage!: Konva.Stage;
  private backgroundLayer!: Konva.Layer;
  private edgeLayer!: Konva.Layer;
  private nodeLayer!: Konva.Layer;

  private panZoomController!: PanZoomController;
  private edgeController = new EdgeInteractionController();

  private selectionLayer!: Konva.Layer;
  private selectionRect?: Konva.Rect;
  private selection = new SelectionController();
  private multiDrag = new MultiDragController();

  private tempLine?: Konva.Line;

  constructor(
    public undoRedo: UndoRedoService,
    private readonly zone: NgZone,
    private readonly editorState: EditorStateService,
  ) {}

  public ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.initStage());

    window.addEventListener('keydown', this.handleKeyDown);
  }

  public ngOnDestroy(): void {
    this.stage.destroy();

    window.removeEventListener('keydown', this.handleKeyDown);
  }

  // ---------- SNAPSHOT ----------

  public getSnapshot(): void {
    console.log(this.editorState.exportSnapshot());
  }

  public setSnapshot(): void {
    const mockSnapshot: IEditorSnapshot = {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger',
          position: { x: 120, y: 220 },
        },
        {
          id: 'action-1',
          type: 'action',
          position: { x: 420, y: 220 },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          fromNodeId: 'trigger-1',
          fromPortId: 'trigger-1-output-port',
          toNodeId: 'action-1',
          toPortId: 'action-1-input-port',
        },
      ],
    };

    this.loadFromSnapshot(mockSnapshot);
  }

  public undo(): void {
    const current = this.editorState.exportSnapshot();
    const snapshot = this.undoRedo.undo(current);
    if (!snapshot) return;

    this.loadFromSnapshot(snapshot);
  }

  public redo(): void {
    const current = this.editorState.exportSnapshot();
    const snapshot = this.undoRedo.redo(current);
    if (!snapshot) return;

    this.loadFromSnapshot(snapshot);
  }

  private loadFromSnapshot(snapshot: IEditorSnapshot): void {
    this.clearEditor();

    snapshot.nodes.forEach((node) => {
      this.createNode(node.id, node.type, node.position, node.type.toUpperCase());
    });

    snapshot.edges.forEach((edge) => {
      const from = this.editorState.findPort(edge.fromPortId);
      const to = this.editorState.findPort(edge.toPortId);
      if (from && to) {
        this.createEdge(from, to);
      }
    });
  }

  private clearEditor(): void {
    this.editorState.clear();
    this.nodeLayer.destroyChildren();
    this.edgeLayer.destroyChildren();
    this.backgroundLayer.destroyChildren();
    this.drawBackgroundGrid();
  }

  // ---------- STAGE ----------

  private initStage(): void {
    const container = this.containerRef.nativeElement;

    this.stage = new Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
    });

    this.backgroundLayer = new Konva.Layer({ listening: true });
    this.edgeLayer = new Konva.Layer();
    this.nodeLayer = new Konva.Layer();
    this.selectionLayer = new Konva.Layer();

    this.stage.add(
      this.backgroundLayer,
      this.edgeLayer,
      this.nodeLayer,
      this.selectionLayer,
    );

    this.drawBackgroundGrid();

    this.panZoomController = new PanZoomController(this.stage);

    this.stage.container().addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.stage.on('mousedown', (e) => {
      const isLeft = e.evt.button === 0;
      const isRight = e.evt.button === 2;

      // ---- ЛЕВАЯ КНОПКА → рамка выделения ----
      if (isLeft && e.target === this.stage) {
        const pointer = this.stage.getPointerPosition();
        if (pointer) {
          const pos = this.toStageCoords(pointer);

          this.selection.startSelection(pos);

          this.selectionRect = new Konva.Rect({
            x: pos.x,
            y: pos.y,
            width: 0,
            height: 0,
            stroke: '#38bdf8',
            strokeWidth: 1,
            dash: [4, 4],
            fill: 'rgba(56,189,248,0.12)',
          });

          this.selectionLayer.add(this.selectionRect);
          this.selectionLayer.batchDraw();
        }

        // простой клик без рамки — очистка выделения
        this.editorState.clearSelection();
        this.refreshSelectionView();

        return; // ❗️ ВАЖНО — НЕ ДАЁМ панорамированию запуститься
      }

      // ---- ПРАВАЯ КНОПКА → PAN ----
      if (isRight) {
        this.panZoomController.onMouseDown(e);
      }
    });

    this.stage.on('mousemove', () => {
      // ---- UPDATE SELECTION ----
      if (this.selection.isActive() && this.selectionRect) {
        const pointer = this.stage.getPointerPosition();
        if (pointer) {
          const pos = this.toStageCoords(pointer);
          this.selection.update(pos);

          const box = this.selection.getBounds();
          if (box) {
            this.selectionRect.setAttrs(box);
            this.selectionLayer.batchDraw();
            this.applySelectionPreview();
          }
        }
      }

      if (this.edgeController.isDragging() && this.tempLine) {
        this.updateTempEdge();
      }

      this.panZoomController.onMouseMove();
    });

    this.stage.on('mouseup', () => {
      // ---- FINISH SELECTION ----
      if (this.selection.isActive()) {
        this.finalizeSelection();
      }

      this.selection.finish();
      this.selectionRect?.destroy();
      this.selectionRect = undefined;

      this.panZoomController.onMouseUp();
      this.finishEdgeDrag();
    });

    this.stage.on('wheel', (e) => {
      this.panZoomController.onWheel(e);
    });

    this.seedDemoNodes();
  }

  private drawBackgroundGrid(): void {
    const pattern = createGridPattern(40, '#1e293b', 1);

    const rect = new Konva.Rect({
      x: -50000,
      y: -50000,
      width: 100000,
      height: 100000,
      fillPatternImage: pattern as unknown as HTMLImageElement,
      listening: false,   // важно для перфоманса
    });

    this.backgroundLayer.add(rect);
    this.backgroundLayer.draw();
  }


  // ---------- NODES ----------

  private seedDemoNodes(): void {
    this.createNode('trigger-1', 'trigger', { x: 120, y: 220 }, 'TRIGGER');
    this.createNode('action-1', 'action', { x: 420, y: 220 }, 'ACTION');
    this.createNode('action-2', 'action', { x: 620, y: 520 }, 'ACTION');
  }

  // Создает ноду и запоминает состояние для undo/redo
  createNodeWithHistory(...args: Parameters<typeof this.createNode>): void {
    this.undoRedo.push(this.editorState.exportSnapshot());
    this.createNode(...args);
  }

  // Создает связь и запоминает состояние для undo/redo
  private createEdgeWithHistory(from: IPort, to: IPort): void {
    this.undoRedo.push(this.editorState.exportSnapshot());
    this.createEdge(from, to);
  }

  // Создает ноду БЕЗ сохранения истории
  private createNode(
    id: string,
    type: NodeType,
    position: { x: number; y: number },
    title: string,
  ): void {
    const group = new Konva.Group({
      x: position.x,
      y: position.y,
      draggable: true,
    });

    const rect = new Konva.Rect({
      width: 160,
      height: 70,
      fill: type === 'trigger' ? '#0ea5e9' : '#22c55e',
      cornerRadius: 10,
      name: 'node-rect',
      strokeWidth: 0,
    });

    const text = new Konva.Text({
      text: title,
      width: 160,
      padding: 12,
      fontStyle: 'bold',
      align: 'center',
    });

    const ports: INode['ports'] = {
      inputs: [],
      outputs: [],
    };

    if (type === 'action') {
      ports.inputs.push(
        this.createPort(id, 'input', 35, group)
      );
    }

    ports.outputs.push(
      this.createPort(id, 'output', 35, group, 160)
    );

    group.add(
      rect,
      text,
      ...ports.inputs.map(p => p.circle),
      ...ports.outputs.map(p => p.circle),
    );

    this.nodeLayer.add(group);
    this.nodeLayer.draw();

    this.editorState.addNode({ id, type, group, ports });

    // ========= UNDO / REDO MOVE =========
    let dragStarted = false;

    group.on('dragstart', () => {
      // 1️⃣ фиксируем состояние до перемещения (один раз на drag)
      this.undoRedo.push(this.editorState.exportSnapshot());

      const selected = this.editorState.selectedNodes;
      const isSelected = selected.has(id);
      const hasMulti = selected.size > 1;

      const idsToMove = (isSelected && hasMulti)
        ? Array.from(selected)
        : [id];

      this.multiDrag.beginDrag(
        id,
        idsToMove,
        (nodeId) => {
          const n = this.editorState.nodes.get(nodeId);
          if (!n) return { x: 0, y: 0 };
          return n.group.position();
        }
      );
    });

    group.on('dragmove', () => {
      const pos = group.position();
      const updates = this.multiDrag.apply(pos);

      for (const [nodeId, newPos] of updates.entries()) {
        const node = this.editorState.nodes.get(nodeId);
        if (!node) continue;

        if (nodeId === id) {
          // мастер уже стоит правильно
          this.updateEdgesForNode(nodeId);
          continue;
        }

        node.group.position(newPos);
        this.updateEdgesForNode(nodeId);
      }
    });

    group.on('dragend', () => {
      this.multiDrag.end();
    });
    // ====================================


    group.on('mousedown', (e) => {
      e.cancelBubble = true;

      const isMultiKey =
        e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey;

      const alreadySelected = this.editorState.selectedNodes.has(id);
      const multiSelected = this.editorState.selectedNodes.size > 1;

      if (isMultiKey) {
        // явное множественное выделение пользователем
        this.editorState.toggleNode(id);
      } else {
        // 🔥 КЛЮЧЕВАЯ ЧАСТЬ:
        // если нода уже часть мульти-выделения — НИЧЕГО не меняем
        if (!(alreadySelected && multiSelected)) {
          this.editorState.selectNode(id);
        }
      }

      this.refreshSelectionView();
    });

    ports.outputs.forEach(output => {
      output.circle.on('mousedown', (e) => {
        e.cancelBubble = true;
        this.startEdgeDrag(output);
      });
    });

    ports.inputs.forEach(input => {
      input.circle.on('mouseenter', () =>
        this.edgeController.setHoveredInput(input),
      );
      input.circle.on('mouseleave', () =>
        this.edgeController.setHoveredInput(undefined),
      );
    });
  }

  private createPort(
    nodeId: string,
    type: PortType,
    y: number,
    group: Konva.Group,
    x = 0,
  ): IPort {
    return {
      id: `${nodeId}-${type}-port`,
      nodeId,
      type,
      circle: new Konva.Circle({
        x,
        y,
        radius: 7,
        fill: type === 'input' ? '#0ea5e9' : '#f97316',
      }),
    };
  }

  // ---------- EDGES ----------

  private startEdgeDrag(port: IPort): void {
    this.edgeController.startDrag(port);

    const from = this.getPortStagePosition(port);
    this.tempLine = new Konva.Line({
      points: [from.x, from.y, from.x, from.y],
      stroke: '#f8fafc',
      dash: [6, 6],
    });

    this.edgeLayer.add(this.tempLine);
    this.edgeLayer.draw();
  }

  private updateTempEdge(): void {
    const output = this.edgeController.getActiveOutput();
    if (!output || !this.tempLine) {
      return;
    }

    const pointer = this.stage.getPointerPosition();
    if (!pointer) {
      return;
    }

    const from = this.getPortStagePosition(output);
    const to = this.toStageCoords(pointer);

    this.tempLine.points([from.x, from.y, to.x, to.y]);
    this.edgeLayer.batchDraw();
  }

  private finishEdgeDrag(): void {
    const result = this.edgeController.finishDrag();

    if (result) {
      this.createEdgeWithHistory(result.from, result.to);
    }

    this.tempLine?.destroy();
    this.tempLine = undefined;
  }

  // Создает связь БЕЗ сохранения истории
  private createEdge(from: IPort, to: IPort): void {
    const p1 = this.getPortStagePosition(from);
    const p2 = this.getPortStagePosition(to);

    const line = new Konva.Line({
      points: [p1.x, p1.y, p2.x, p2.y],
      stroke: '#e5e7eb',
      strokeWidth: 2,
      hitStrokeWidth: 10,
    });

    this.edgeLayer.add(line);
    this.edgeLayer.draw();

    const edge: IEdge = {
      id: `edge-${Date.now()}-${Math.random()}`,
      fromNodeId: from.nodeId,
      toNodeId: to.nodeId,
      fromPortId: from.id,
      toPortId: to.id,
      type: 'straight',
      line,
    };

    this.editorState.addEdge(edge);
    this.registerEdgeInteractions(edge);
  }

  private updateEdgesForNode(nodeId: string): void {
    for (const edge of this.editorState.edges.values()) {
      if (edge.fromNodeId === nodeId || edge.toNodeId === nodeId) {
        this.updateEdgeGeometry(edge);
      }
    }
  }

  private updateEdgeGeometry(edge: IEdge): void {
    const fromPort = this.editorState.findPort(edge.fromPortId);
    const toPort = this.editorState.findPort(edge.toPortId);
    if (!fromPort || !toPort) {
      return;
    }

    const stageTransform = this.stage.getAbsoluteTransform().copy();
    stageTransform.invert();

    const from = stageTransform.point(
      fromPort.circle.getAbsolutePosition()
    );
    const to = stageTransform.point(
      toPort.circle.getAbsolutePosition()
    );

    const points = EdgeGeometryCalculator.calculate({
      from,
      to,
      type: edge.type,
    });

    edge.line.points(points);
    edge.line.getLayer()?.batchDraw();
  }

  private toStageCoords(point: Konva.Vector2d): Konva.Vector2d {
    const t = this.stage.getAbsoluteTransform().copy();
    t.invert();
    return t.point(point);
  }

  private getPortStagePosition(port: IPort): Konva.Vector2d {
    return this.toStageCoords(port.circle.getAbsolutePosition());
  }

  private refreshSelectionView(): void {
    // ------- НОДЫ -------
    for (const node of this.editorState.nodes.values()) {
      const isSelected = this.editorState.selectedNodes.has(node.id);
      const rect = node.group.findOne<Konva.Rect>('.node-rect');
      if (!rect) continue;

      if (isSelected) {
        rect.stroke('#b11aef');
        rect.strokeWidth(3);
      } else {
        rect.stroke(undefined as any);
        rect.strokeWidth(0);
      }
    }

    // ------- ЛИНИИ -------
    for (const edge of this.editorState.edges.values()) {
      const isSelected = this.editorState.selectedEdges.has(edge.id);

      if (isSelected) {
        edge.line.stroke('#b11aef');
        edge.line.strokeWidth(3);
      } else {
        edge.line.stroke('#e5e7eb');
        edge.line.strokeWidth(2);
      }
    }

    this.nodeLayer.batchDraw();
    this.edgeLayer.batchDraw();
  }

  // Обрабатываем хоткеи
  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelection();
    }

    // Ctrl + D
    if (e.key.toLowerCase() === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.duplicateSelection();
    }

    // Undo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      return;
    }

    // Redo Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }

    // Redo Ctrl+Shift+Z
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.redo();
      return;
    }
  };

  private deleteSelection(): void {
    this.undoRedo.push(this.editorState.exportSnapshot());

    // ---- Удаляем выделенные ребра ----
    for (const edgeId of Array.from(this.editorState.selectedEdges)) {
      const edge = this.editorState.edges.get(edgeId);
      if (!edge) continue;

      edge.line.destroy();
      this.editorState.deleteEdge(edgeId);
    }

    // ---- Удаляем выделенные ноды ----
    for (const nodeId of Array.from(this.editorState.selectedNodes)) {
      const node = this.editorState.nodes.get(nodeId);
      if (!node) continue;

      // 🔥 Уничтожаем линии, которые связаны с нодой
      for (const edge of this.editorState.edges.values()) {
        if (edge.fromNodeId === nodeId || edge.toNodeId === nodeId) {
          edge.line.destroy();
          this.editorState.deleteEdge(edge.id);
        }
      }

      // 🔥 Уничтожаем визуальную группу ноды
      node.group.destroy();

      // 🔥 Чистим state ноды
      this.editorState.deleteNode(nodeId);
    }

    this.edgeLayer.batchDraw();
    this.nodeLayer.batchDraw();

    this.editorState.clearSelection();
  }

  private duplicateSelection(): void {
    this.undoRedo.push(this.editorState.exportSnapshot());

    const selected = Array.from(this.editorState.selectedNodes);
    if (!selected.length) return;

    const nodeIdMap = new Map<string, string>(); // oldNodeId -> newNodeId
    const portIdMap = new Map<string, string>(); // oldPortId -> newPortId

    // ---------- 1) Дублируем ноды ----------
    for (const nodeId of selected) {
      const node = this.editorState.nodes.get(nodeId);
      if (!node) continue;

      if (node.type === 'trigger') continue; // запрещено

      const newId = `${node.type}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;

      nodeIdMap.set(nodeId, newId);

      const pos = node.group.position();

      // создаём новую ноду
      this.createNode(
        newId,
        node.type,
        { x: pos.x + 40, y: pos.y + 40 },
        `Copy`
      );

      // ---------- 1.1) Mаппим порты ----------
      const newNode = this.editorState.nodes.get(newId);
      if (!newNode) continue;

      node.ports.inputs.forEach((p, i) => {
        portIdMap.set(p.id, newNode.ports.inputs[i].id);
      });

      node.ports.outputs.forEach((p, i) => {
        portIdMap.set(p.id, newNode.ports.outputs[i].id);
      });
    }

    // ---------- 2) Дублируем связи ----------
    for (const edge of this.editorState.edges.values()) {
      // связь имеет смысл копировать
      // только если обе ноды из selection
      if (
        !nodeIdMap.has(edge.fromNodeId) ||
        !nodeIdMap.has(edge.toNodeId)
      ) {
        continue;
      }

      const newFromPort = portIdMap.get(edge.fromPortId);
      const newToPort = portIdMap.get(edge.toPortId);

      if (!newFromPort || !newToPort) {
        continue;
      }

      const from = this.editorState.findPort(newFromPort);
      const to = this.editorState.findPort(newToPort);

      if (from && to) {
        this.createEdge(from, to);
      }
    }

    // ---------- 3) Обновляем selection ----------
    this.editorState.clearSelection();
    for (const id of nodeIdMap.values()) {
      this.editorState.selectedNodes.add(id);
    }

    this.nodeLayer.batchDraw();
    this.edgeLayer.batchDraw();
  }

  // Логика выбора нод рамкой
  private applySelectionPreview(): void {
    const box = this.selection.getBounds();
    if (!box) return;

    const isMultiAppend =
      window.event instanceof MouseEvent &&
      (window.event as MouseEvent).shiftKey;

    if (!isMultiAppend) {
      this.editorState.clearSelection();
    }

    for (const node of this.editorState.nodes.values()) {
      const pos = node.group.position();
      const width = 160;
      const height = 70;

      const inside =
        pos.x >= box.x &&
        pos.y >= box.y &&
        pos.x + width <= box.x + box.width &&
        pos.y + height <= box.y + box.height;

      if (inside) {
        this.editorState.selectedNodes.add(node.id);
      }
    }

    this.refreshSelectionView();
  }

  private finalizeSelection(): void {
    this.applySelectionPreview();
  }

  private registerEdgeInteractions(edge: IEdge): void {
    edge.line.on('mousedown', (e) => {
      e.cancelBubble = true;

      const isMulti =
        e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey;

      if (isMulti) {
        if (this.editorState.selectedEdges.has(edge.id)) {
          this.editorState.selectedEdges.delete(edge.id);
        } else {
          this.editorState.selectedEdges.add(edge.id);
        }
      } else {
        this.editorState.clearSelection();
        this.editorState.selectedEdges.add(edge.id);
      }

      this.refreshSelectionView();
    });
  }

}
