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
  }

  ngOnDestroy(): void {
    this.stage.destroy();
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
    });

    const text = new Konva.Text({
      text: title,
      width: 160,
      padding: 12,
      fontStyle: 'bold',
      align: 'center',
    });

    const ports: INode['ports'] = {};

    if (type === 'action') {
      ports.input = this.createPort(id, 'input', 35, group);
    }

    ports.output = this.createPort(id, 'output', 35, group, 160);

    group.add(rect, text, ...(ports.input ? [ports.input.circle] : []), ports.output.circle);
    this.nodeLayer.add(group);
    this.nodeLayer.draw();

    this.editorState.addNode({ id, type, group, ports });

    group.on('dragmove', () => this.updateEdgesForNode(id));

    ports.output.circle.on('mousedown', (e) => {
      e.cancelBubble = true;
      this.startEdgeDrag(ports.output!);
    });

    if (ports.input) {
      ports.input.circle.on('mouseenter', () =>
        this.edgeController.setHoveredInput(ports.input),
      );
      ports.input.circle.on('mouseleave', () =>
        this.edgeController.setHoveredInput(undefined),
      );
    }
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
    const from = this.editorState.findPort(edge.fromPortId);
    const to = this.editorState.findPort(edge.toPortId);
    if (!from || !to) {
      return;
    }

    const t = this.stage.getAbsoluteTransform().copy();
    t.invert();

    const p1 = t.point(from.circle.getAbsolutePosition());
    const p2 = t.point(to.circle.getAbsolutePosition());

    edge.line.points([p1.x, p1.y, p2.x, p2.y]);
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
}
