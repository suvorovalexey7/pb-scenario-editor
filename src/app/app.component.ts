import { Component, ViewChild } from '@angular/core';
import { EditorComponent } from './editor/editor.component';
import { EditorSnapshot, EditorStateService } from './editor/editor.service';

@Component({
  selector: 'app-root',
  imports: [EditorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  @ViewChild('editor') editorComponent!: EditorComponent;

  constructor(private editorState: EditorStateService) {}

  getSnapshot() {
    const snapshot = this.editorState.exportSnapshot();
    console.log(snapshot);
  }

  setSnapshot(): void {
    const mockSnapshot = {
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
          id: 'edge-1766527229784',
          fromNodeId: 'trigger-1',
          fromPortId: 'trigger-1-output-port',
          toNodeId: 'action-1',
          toPortId: 'action-1-input-port',
        },
      ],
    } as EditorSnapshot;

    this.editorComponent.loadFromSnapshot(mockSnapshot);
    // this.editorState.loadSnapshot(mockSnapshot);
  }
}
