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

@Component({
  selector: 'app-editor',
  standalone: true,
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private stage!: Konva.Stage;
  private backgroundLayer!: Konva.Layer;
  private edgeLayer!: Konva.Layer;
  private nodeLayer!: Konva.Layer;

  private panZoomController!: PanZoomController;
  private edgeController = new EdgeInteractionController();

  private tempLine?: Konva.Line;

  constructor(
    private readonly zone: NgZone,
    private readonly editorState: EditorStateService,
  ) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.initStage());

    window.addEventListener('keydown', this.handleKeyDown);
  }

  ngOnDestroy(): void {
    this.stage.destroy();

    window.removeEventListener('keydown', this.handleKeyDown);
  }

  // ---------- SNAPSHOT ----------

  getSnapshot(): void {
    console.log(this.editorState.exportSnapshot());
  }

  setSnapshot(): void {
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

    this.stage.add(this.backgroundLayer, this.edgeLayer, this.nodeLayer);

    this.drawBackgroundGrid();

    this.panZoomController = new PanZoomController(this.stage);

    this.stage.on('mousedown', (e) => {
      // клик именно по фону (stage), а не по ноде/линии/порту
      if (e.target === this.stage) {
        this.editorState.clearSelection();
        this.refreshSelectionView();
      }

      this.panZoomController.onMouseDown(e);
    });

    this.stage.on('mousemove', () => {
      if (this.edgeController.isDragging() && this.tempLine) {
        this.updateTempEdge();
      }
      this.panZoomController.onMouseMove();
    });

    this.stage.on('mouseup', () => {
      this.panZoomController.onMouseUp();
      this.finishEdgeDrag();
    });

    this.stage.on('wheel', (e) => {
      this.panZoomController.onWheel(e);
    });

    this.seedDemoNodes();
  }

  private drawBackgroundGrid(): void {
    const gridSize = 40;
    const { width, height } = this.stage.size();

    for (let i = 0; i < width / gridSize; i++) {
      this.backgroundLayer.add(
        new Konva.Line({
          points: [i * gridSize, 0, i * gridSize, height],
          stroke: '#1e293b',
        }),
      );
    }

    for (let j = 0; j < height / gridSize; j++) {
      this.backgroundLayer.add(
        new Konva.Line({
          points: [0, j * gridSize, width, j * gridSize],
          stroke: '#1e293b',
        }),
      );
    }

    this.backgroundLayer.draw();
  }

  // ---------- NODES ----------

  private seedDemoNodes(): void {
    this.createNode('trigger-1', 'trigger', { x: 120, y: 220 }, 'Trigger');
    this.createNode('action-1', 'action', { x: 420, y: 220 }, 'Action');
    this.createNode('action-2', 'action', { x: 620, y: 520 }, 'Action');
  }

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

    group.on('dragmove', () => this.updateEdgesForNode(id));

    group.on('mousedown', (e) => {
      // чтобы клик по ноде не запускал pan на stage
      e.cancelBubble = true;

      const isMulti =
        e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey;

      if (isMulti) {
        this.editorState.toggleNode(id);
      } else {
        this.editorState.selectNode(id);
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
      this.createEdge(result.from, result.to);
    }

    this.tempLine?.destroy();
    this.tempLine = undefined;
  }

  private createEdge(from: IPort, to: IPort): void {
    const p1 = this.getPortStagePosition(from);
    const p2 = this.getPortStagePosition(to);

    const line = new Konva.Line({
      points: [p1.x, p1.y, p2.x, p2.y],
      stroke: '#e5e7eb',
      strokeWidth: 2,
    });

    this.edgeLayer.add(line);
    this.edgeLayer.draw();

    const edge: IEdge = {
      id: `edge-${Date.now()}`,
      fromNodeId: from.nodeId,
      toNodeId: to.nodeId,
      fromPortId: from.id,
      toPortId: to.id,
      type: 'straight',
      line,
    };

    this.editorState.addEdge(edge);
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
    for (const node of this.editorState.nodes.values()) {
      const isSelected = this.editorState.selectedNodes.has(node.id);

      const rect = node.group.findOne<Konva.Rect>('.node-rect');
      if (!rect) {
        continue;
      }

      if (isSelected) {
        rect.stroke('#cd19b1');  // голубая рамка
        rect.strokeWidth(3);
      } else {
        rect.stroke(undefined as any);
        rect.strokeWidth(0);
      }
    }

    this.nodeLayer.batchDraw();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelection();
    }
  };

  private deleteSelection(): void {

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

}
