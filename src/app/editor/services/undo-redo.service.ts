import { Injectable } from '@angular/core';
import { IEditorSnapshot } from '../interfaces/editor-snapshot.interface';

@Injectable({ providedIn: 'root' })
export class UndoRedoService {
  private undoStack: IEditorSnapshot[] = [];
  private redoStack: IEditorSnapshot[] = [];

  private readonly LIMIT = 10;

  push(snapshot: IEditorSnapshot): void {
    this.undoStack.push(structuredClone(snapshot));

    if (this.undoStack.length > this.LIMIT) {
      this.undoStack.shift();
    }

    this.redoStack = [];
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(current: IEditorSnapshot): IEditorSnapshot | null {
    if (!this.canUndo()) return null;

    const snapshot = this.undoStack.pop()!;
    this.redoStack.push(structuredClone(current));

    return structuredClone(snapshot);
  }

  redo(current: IEditorSnapshot): IEditorSnapshot | null {
    if (!this.canRedo()) return null;

    const snapshot = this.redoStack.pop()!;
    this.undoStack.push(structuredClone(current));

    return structuredClone(snapshot);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
