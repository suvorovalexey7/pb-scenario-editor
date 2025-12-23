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
import {
  EditorStateService,
  NodeModel,
  NodeType,
  PortModel,
  PortType,
  EdgeModel,
} from './editor.service';

@Component({
  selector: 'app-editor',
  standalone: true,
  template: `<div #container class="editor-container"></div>`,
  styles: [
    `
      .editor-container {
        height: 100vh;
        width: 100%;
        background: #0f172a;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private stage!: Konva.Stage;
  private backgroundLayer!: Konva.Layer;
  private edgeLayer!: Konva.Layer;
  private nodeLayer!: Konva.Layer;

  private isPanning = false;
  private lastPanPosition?: Konva.Vector2d;

  private activeOutputPort?: PortModel;
  private hoveredInputPort?: PortModel;
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
    this.setupPanAndZoom();
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

  // ---------- PAN / ZOOM ----------

  private setupPanAndZoom(): void {
    this.stage.on('mousedown', (e) => {
      if (e.target === this.stage) {
        this.isPanning = true;
        this.lastPanPosition = this.stage.getPointerPosition() ?? undefined;
      }
    });

    this.stage.on('mouseup', () => {
      this.isPanning = false;
      this.lastPanPosition = undefined;
      this.finishTempEdge();
    });

    this.stage.on('mousemove', () => {
      if (this.activeOutputPort && this.tempLine) {
        this.updateTempLine();
      }

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
    });

    this.stage.on('wheel', (e) => {
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

      const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
      this.stage.scale({ x: newScale, y: newScale });

      this.stage.position({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });

      this.stage.batchDraw();
    });
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

    const ports: NodeModel['ports'] = {};

    if (type === 'action') {
      ports.input = this.createPort(id, 'input', 35, group);
    }

    ports.output = this.createPort(id, 'output', 35, group, 160);

    group.add(rect, text, ...(ports.input ? [ports.input.circle] : []), ports.output.circle);
    this.nodeLayer.add(group);
    this.nodeLayer.draw();

    const nodeModel: NodeModel = { id, type, group, ports };
    this.editorState.addNode(nodeModel);

    group.on('dragmove', () => {
      this.updateEdgesForNode(id);
    });

    ports.output.circle.on('mousedown', (e) => {
      e.cancelBubble = true;
      this.startTempEdge(ports.output!);
    });

    if (ports.input) {
      ports.input.circle.on('mouseenter', () => (this.hoveredInputPort = ports.input));
      ports.input.circle.on('mouseleave', () => (this.hoveredInputPort = undefined));
    }
  }

  private createPort(
    nodeId: string,
    type: PortType,
    y: number,
    group: Konva.Group,
    x = 0,
  ): PortModel {
    const id = `${nodeId}-${type}-port`;
    const circle = new Konva.Circle({
      x,
      y,
      radius: 7,
      fill: type === 'input' ? '#0ea5e9' : '#f97316',
    });

    return { id, nodeId, type, circle };
  }

  // ---------- EDGES ----------

  private startTempEdge(port: PortModel): void {
    this.activeOutputPort = port;

    const from = this.getPortStagePosition(port);
    this.tempLine = new Konva.Line({
      points: [from.x, from.y, from.x, from.y],
      stroke: '#f8fafc',
      dash: [6, 6],
    });

    this.edgeLayer.add(this.tempLine);
    this.edgeLayer.draw();
  }

  private updateTempLine(): void {
    if (!this.activeOutputPort || !this.tempLine) {
      return;
    }

    const pointer = this.stage.getPointerPosition();
    if (!pointer) {
      return;
    }

    const from = this.getPortStagePosition(this.activeOutputPort);
    const to = this.toStageCoords(pointer);

    this.tempLine.points([from.x, from.y, to.x, to.y]);
    this.edgeLayer.batchDraw();
  }

  private finishTempEdge(): void {
    if (this.activeOutputPort && this.hoveredInputPort) {
      this.createEdge(this.activeOutputPort, this.hoveredInputPort);
    }

    this.tempLine?.destroy();
    this.tempLine = undefined;
    this.activeOutputPort = undefined;
  }

  private createEdge(fromPort: PortModel, toPort: PortModel): void {
    const from = this.getPortStagePosition(fromPort);
    const to = this.getPortStagePosition(toPort);

    const line = new Konva.Line({
      points: [from.x, from.y, to.x, to.y],
      stroke: '#e5e7eb',
      strokeWidth: 2,
    });

    this.edgeLayer.add(line);
    this.edgeLayer.draw();

    const edge: EdgeModel = {
      id: `edge-${Date.now()}`,
      fromNodeId: fromPort.nodeId,
      toNodeId: toPort.nodeId,
      fromPortId: fromPort.id,
      toPortId: toPort.id,
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

  private updateEdgeGeometry(edge: EdgeModel): void {
    const fromPort = this.editorState.findPort(edge.fromPortId);
    const toPort = this.editorState.findPort(edge.toPortId);
    if (!fromPort || !toPort) {
      return;
    }

    const stageTransform = this.stage.getAbsoluteTransform().copy();
    stageTransform.invert();

    const fromAbs = fromPort.circle.getAbsolutePosition();
    const toAbs = toPort.circle.getAbsolutePosition();

    const from = stageTransform.point(fromAbs);
    const to = stageTransform.point(toAbs);

    edge.line.points([from.x, from.y, to.x, to.y]);
    edge.line.getLayer()?.batchDraw();
  }

  private toStageCoords(point: Konva.Vector2d): Konva.Vector2d {
    const transform = this.stage.getAbsoluteTransform().copy();
    transform.invert();
    return transform.point(point);
  }

  private getPortStagePosition(port: PortModel): Konva.Vector2d {
    return this.toStageCoords(port.circle.getAbsolutePosition());
  }
}
