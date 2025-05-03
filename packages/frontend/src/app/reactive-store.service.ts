import { Injectable } from '@angular/core';
import { BehaviorSubject, distinct } from 'rxjs';
import { createStore } from 'tinybase';
import { createMergeableStore } from 'tinybase';
import { createWsSynchronizer, WsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { environment } from '../environments/environment';

@Injectable()
export class ReactiveStoreService {
  store = createMergeableStore();
  synchronizer: WsSynchronizer<WebSocket> | undefined
  textSubject = new BehaviorSubject('');
  docId = '';

  constructor() {
    this.store.addValueListener('text',
      (store, valueId, newValue, oldValue, getValueChange) =>
        this.textSubject.next(newValue.toString())
    );
  }

  async setDocId(id: string) {
    this.docId = id;
    if (this.synchronizer) {
      this.synchronizer.stopSync().destroy();
    }
    this.synchronizer = await createWsSynchronizer(
      this.store,
      new ReconnectingWebSocket(getWsUrl(id)) as WebSocket);
    this.synchronizer.startSync();
  }

  getText() {
    return this.textSubject.asObservable()
      .pipe(distinct());
  }

  setText(text: string) {
    this.store.setValue('text', text);
  }

}

function getWsUrl(docId: string) {
  const url = new URL(window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws';
  url.pathname = '/ws/sync/' + docId;
  return url.href;
}
