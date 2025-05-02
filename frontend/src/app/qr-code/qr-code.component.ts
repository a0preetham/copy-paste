import { AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { toCanvas } from 'qrcode';

@Component({
  selector: 'app-qr-code',
  imports: [],
  templateUrl: './qr-code.component.html',
  styleUrl: './qr-code.component.scss'
})
export class QrCodeComponent implements AfterViewInit, OnChanges {

  @ViewChild('qrCodeCanvas') qrCodeCanvasEl!: ElementRef<HTMLCanvasElement>;
  @Input() url: string = 'https://google.com';
  width = 200;
  height = 200;

  ngAfterViewInit(): void {
    this.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['url']) {
      this.render();
    }
  }

  render() {
    if (!this.qrCodeCanvasEl?.nativeElement || !this.url) {
      return;
    }

    toCanvas(this.qrCodeCanvasEl.nativeElement, this.url, {
      width: this.width,
    }, function (error) {
      if (error) console.error(error)
      console.log('success!');
    })

  }

}
