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
  EditorService,
  NodeModel,
  NodeType,
  PortModel,
  PortType,
} from './editor.service';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [],
  template: `<div #container class="editor-container"></div>`,
  styles: [
    `
      .editor-container {
        height: 100vh;
        width: 100%;
        display: block;
        background: #0f172a;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private stage?: Konva.Stage;
  private backgroundLayer?: Konva.Layer;
  private edgeLayer?: Konva.Layer;
  private nodeLayer?: Konva.Layer;

  private isPanning = false;
  private lastPanPosition?: Konva.Vector2d;

  private activeOutputPort?: PortModel;
  private hoveredInputPort?: PortModel;
  private tempLine?: Konva.Line;

  constructor(
    private readonly zone: NgZone,
    private readonly editor: EditorService,
  ) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.initStage());
  }

  ngOnDestroy(): void {
    this.stage?.destroy();
  }

  private initStage(): void {
    const container = this.containerRef.nativeElement;
    const stage = new Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
      draggable: false,
    });

    const backgroundLayer = new Konva.Layer({ listening: true });
    const edgeLayer = new Konva.Layer();
    const nodeLayer = new Konva.Layer();

    stage.add(backgroundLayer, edgeLayer, nodeLayer);

    this.stage = stage;
    this.backgroundLayer = backgroundLayer;
    this.edgeLayer = edgeLayer;
    this.nodeLayer = nodeLayer;

    this.drawBackgroundGrid();
    this.setupPanAndZoom();
    this.seedDemoNodes();
  }

  // Rendering: simple grid helps to read movement during pan/zoom.
  private drawBackgroundGrid(): void {
    if (!this.backgroundLayer || !this.stage) {
      return;
    }
    const gridSize = 40;
    const { width, height } = this.stage.size();

    const lines: Konva.Line[] = [];
    for (let i = 0; i < width / gridSize; i++) {
      lines.push(
        new Konva.Line({
          points: [i * gridSize, 0, i * gridSize, height],
          stroke: '#1e293b',
          strokeWidth: 1,
        }),
      );
    }
    for (let j = 0; j < height / gridSize; j++) {
      lines.push(
        new Konva.Line({
          points: [0, j * gridSize, width, j * gridSize],
          stroke: '#1e293b',
          strokeWidth: 1,
        }),
      );
    }

    this.backgroundLayer.add(...lines);
    this.backgroundLayer.draw();
  }

  // Interaction: panning and zooming the full stage outside Angular zone.
  private setupPanAndZoom(): void {
    if (!this.stage) {
      return;
    }

    this.stage.on('mousedown touchstart', (e) => {
      if (e.target === this.stage) {
        this.isPanning = true;
        this.lastPanPosition = this.stage?.getPointerPosition() ?? undefined;
      }
    });

    this.stage.on('mouseup touchend', () => {
      this.isPanning = false;
      this.lastPanPosition = undefined;
      this.finishTempEdge();
    });

    this.stage.on('mousemove touchmove', () => {
      if (!this.stage) {
        return;
      }
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

      const dx = pointer.x - this.lastPanPosition.x;
      const dy = pointer.y - this.lastPanPosition.y;
      this.stage.position({
        x: this.stage.x() + dx,
        y: this.stage.y() + dy,
      });
      this.stage.batchDraw();
      this.lastPanPosition = pointer;
    });

    this.stage.on('wheel', (e) => {
      e.evt.preventDefault();
      if (!this.stage) {
        return;
      }
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

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

      this.stage.scale({ x: newScale, y: newScale });
      const newPos = {
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      };
      this.stage.position(newPos);
      this.stage.batchDraw();
    });
  }

  private seedDemoNodes(): void {
    this.createNode('trigger-1', 'trigger', { x: 120, y: 220 }, 'Trigger');
    this.createNode('action-1', 'action', { x: 420, y: 220 }, 'Action');
  }

  // Rendering + interaction: build a draggable node with ports and listeners.
  private createNode(
    id: string,
    type: NodeType,
    position: { x: number; y: number },
    title: string,
  ): void {
    if (!this.nodeLayer || !this.edgeLayer) {
      return;
    }

    const width = 160;
    const height = 70;

    const group = new Konva.Group({
      x: position.x,
      y: position.y,
      draggable: true,
    });

    const rect = new Konva.Rect({
      width,
      height,
      fill: type === 'trigger' ? '#0ea5e9' : '#22c55e',
      cornerRadius: 10,
      shadowColor: '#0f172a',
      shadowBlur: 10,
      shadowOpacity: 0.35,
    });

    const text = new Konva.Text({
      text: title,
      fontSize: 16,
      fill: '#0b1120',
      padding: 12,
      fontStyle: 'bold',
      width,
      align: 'center',
    });

    const ports: NodeModel['ports'] = {};
    if (type === 'action') {
      ports.input = this.createPort(id, 'input', height / 2, group);
    }
    ports.output = this.createPort(id, 'output', height / 2, group, width);

    group.add(rect, text, ...(ports.input ? [ports.input.circle] : []), ports.output.circle);
    this.nodeLayer.add(group);
    this.nodeLayer.draw();

    const nodeModel: NodeModel = { id, type, group, ports };
    this.editor.addNode(nodeModel);

    group.on('dragmove', () => {
      this.editor.moveNode(id);
    });

    if (ports.output) {
      ports.output.circle.on('mousedown touchstart', (evt: any) => {
        evt.cancelBubble = true;
        this.startTempEdge(ports.output!);
      });
    }

    if (ports.input) {
      ports.input.circle.on('mouseenter', () => {
        this.hoveredInputPort = ports.input ?? undefined;
      });
      ports.input.circle.on('mouseleave', () => {
        if (this.hoveredInputPort?.id === ports.input?.id) {
          this.hoveredInputPort = undefined;
        }
      });
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
      stroke: '#0b1120',
      strokeWidth: 2,
    });
    return { id, nodeId, type, circle };
  }

  // Interaction: start drawing a temporary edge from an output port.
  private startTempEdge(port: PortModel): void {
    this.activeOutputPort = port;
    if (!this.edgeLayer) {
      return;
    }

    const fromPos = this.getPortStagePosition(port);
    this.tempLine = new Konva.Line({
      points: [fromPos.x, fromPos.y, fromPos.x, fromPos.y],
      stroke: '#f8fafc',
      dash: [6, 6],
      strokeWidth: 2,
    });
    this.edgeLayer.add(this.tempLine);
    this.edgeLayer.draw();
  }

  private updateTempLine(): void {
    if (!this.stage || !this.activeOutputPort || !this.tempLine) {
      return;
    }
    const pointer = this.stage.getPointerPosition();
    if (!pointer) {
      return;
    }
    const fromPos = this.getPortStagePosition(this.activeOutputPort);
    const target = this.toStageCoords(pointer);
    this.tempLine.points([fromPos.x, fromPos.y, target.x, target.y]);
    this.edgeLayer?.batchDraw();
  }

  private finishTempEdge(): void {
    if (!this.activeOutputPort || !this.edgeLayer) {
      return;
    }

    const targetInput = this.hoveredInputPort;
    if (targetInput) {
      this.createEdge(this.activeOutputPort, targetInput);
    }

    this.tempLine?.destroy();
    this.tempLine = undefined;
    this.activeOutputPort = undefined;
    this.edgeLayer.batchDraw();
  }

  // Rendering: commit an edge line and register it in the service.
  private createEdge(fromPort: PortModel, toPort: PortModel): void {
    if (!this.edgeLayer) {
      return;
    }
    const fromPos = this.getPortStagePosition(fromPort);
    const toPos = this.getPortStagePosition(toPort);

    const line = new Konva.Line({
      points: [fromPos.x, fromPos.y, toPos.x, toPos.y],
      stroke: '#e5e7eb',
      strokeWidth: 2,
      lineCap: 'round',
      lineJoin: 'round',
    });

    this.edgeLayer.add(line);
    this.edgeLayer.draw();

    const edgeId = `edge-${fromPort.nodeId}-${toPort.nodeId}-${Date.now()}`;
    this.editor.addEdge({
      id: edgeId,
      fromNodeId: fromPort.nodeId,
      toNodeId: toPort.nodeId,
      fromPortId: fromPort.id,
      toPortId: toPort.id,
      line,
    });
  }

  // Helpers: convert screen/absolute coords into stage coords (independent of current zoom/pan).
  private toStageCoords(point: Konva.Vector2d): Konva.Vector2d {
    const stage = this.stage;
    if (!stage) {
      return point;
    }
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    return transform.point(point);
    }

  private getPortStagePosition(port: PortModel): Konva.Vector2d {
    const abs = port.circle.getAbsolutePosition();
    return this.toStageCoords(abs);
  }
}

