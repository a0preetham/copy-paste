import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { QrCodeComponent } from "../qr-code/qr-code.component";
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ReactiveStoreService } from '../reactive-store.service';

@Component({
  selector: 'app-editor',
  imports: [QrCodeComponent, MatInputModule, MatFormFieldModule, ReactiveFormsModule],
  templateUrl: './editor.component.html',
  styleUrl: './editor.component.scss',
  providers: [ReactiveStoreService]
})
export class EditorComponent implements OnInit {
  route = inject(ActivatedRoute);
  store = inject(ReactiveStoreService);
  url = window.location.href;
  id = '';
  content = new FormControl('');

  ngOnInit() {
    this.id = this.route.snapshot.queryParams['id'];
    this.store.setDocId(this.id);
    console.log(this.id);

    this.store.getText().subscribe({
      next: text => {
        this.content.setValue(text);
      }, error: err => {
        console.error(err);
      }
    });
  }

  onChange(event: Event) {
    this.store.setText(this.content.value || '');
  }
}
