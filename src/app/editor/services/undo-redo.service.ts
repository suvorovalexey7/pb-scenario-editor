import { Injectable, NgZone } from '@angular/core';
import { IEditorSnapshot } from '../interfaces/editor-snapshot.interface';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UndoRedoService {
  private undoStack: IEditorSnapshot[] = [];
  private redoStack: IEditorSnapshot[] = [];

  private readonly LIMIT = 10;

  private canUndoSubject = new BehaviorSubject<boolean>(false);
  private canRedoSubject = new BehaviorSubject<boolean>(false);

  canUndo$ = this.canUndoSubject.asObservable();
  canRedo$ = this.canRedoSubject.asObservable();

  constructor(private readonly zone: NgZone) {}

  push(snapshot: IEditorSnapshot): void {
    this.undoStack.push(structuredClone(snapshot));

    if (this.undoStack.length > this.LIMIT) {
      this.undoStack.shift();
    }

    this.redoStack = [];

    this.updateFlags();
  }

  undo(current: IEditorSnapshot): IEditorSnapshot | null {
    if (!this.undoStack.length) return null;

    const snapshot = this.undoStack.pop()!;
    this.redoStack.push(structuredClone(current));

    this.updateFlags();
    return structuredClone(snapshot);
  }

  redo(current: IEditorSnapshot): IEditorSnapshot | null {
    if (!this.redoStack.length) return null;

    const snapshot = this.redoStack.pop()!;
    this.undoStack.push(structuredClone(current));

    this.updateFlags();
    return structuredClone(snapshot);
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];

    this.updateFlags();
  }

  private updateFlags(): void {
    this.zone.run(() => {
      this.canUndoSubject.next(this.undoStack.length > 0);
      this.canRedoSubject.next(this.redoStack.length > 0);
    });
  }
}
