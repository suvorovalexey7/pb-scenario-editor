import { Component } from '@angular/core';
import { EditorComponent } from './editor/components/editor/editor.component';

@Component({
  selector: 'app-root',
  imports: [EditorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {}
