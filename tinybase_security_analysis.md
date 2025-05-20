# TinyBase Data Synchronization Security Analysis

This report analyzes the security considerations for TinyBase data synchronization as implemented in the current application, based on `src/index.ts` and general TinyBase principles.

## 1. Data Scoping and Authorization

The application employs a robust mechanism for scoping data and authorizing access to specific datasets, primarily leveraging Cloudflare's Durable Object (DO) architecture and JWT validation.

*   **Durable Objects for Data Isolation:**
    Cloudflare Durable Objects are instantiated per unique ID. In this application, the `id` from the URL (e.g., `/ws/sync/:id`) is used to identify or create a specific `SyncObject` instance. All data persisted by that `SyncObject` instance is stored in its own isolated storage, provided by the Cloudflare platform. This means that data for `id=XYZ` is physically separated from data for `id=ABC`.

*   **JWT for Authorization to a Specific Scope:**
    Before a WebSocket connection is established to a `SyncObject`, the server validates a JWT. A critical part of this validation is the check: `payload?.id === id_from_url`. This ensures that the JWT presented by the client:
    1.  Is valid and signed by the server.
    2.  Contains an `id` claim that matches the `id` of the resource (and thus the specific `SyncObject` instance) the client is attempting to connect to.

    This effectively authorizes the client for the specific data scope represented by that `id`. A client with a JWT for `id=XYZ` cannot use it to connect to the `SyncObject` for `id=ABC`.

*   **Role of `persister-durable-object-storage`:**
    The `tinybase/persisters/persister-durable-object-storage` is designed to save a TinyBase Store's content into the private storage of the Durable Object instance it's running within. When a `MergeableStore` (typically used with synchronization) is created within the `SyncObject` and this persister is attached, all its tables, rows, and cells are automatically saved to that DO's storage.
    *   **Data At Rest:** This ensures that the data for a specific `id` is persisted within the correct DO's isolated storage.
    *   **Data In Transit (Implicitly):** While the persister handles data at rest, the `WsServerDurableObject` handles synchronizing this data over WebSockets only with clients that have successfully authenticated (via the JWT check) for that specific `SyncObject` instance.

**Conclusion for Data Scoping:** The combination of JWT validation against the URL `id` and the inherent single-instance nature of Durable Objects (tied to that `id`) ensures that data is correctly and securely scoped. Clients can only access and synchronize data for the `id` to which they are explicitly authorized.

## 2. Input Data Validation (Type Enforcement via Schemas)

TinyBase offers schema capabilities to enforce data types and set default values for cells in tables and values. This is a crucial server-side control to maintain data integrity.

*   **TinyBase Schema Capabilities:**
    *   **`TablesSchema`:** Allows defining the structure of tables, including the data type for each cell (e.g., `string`, `number`, `boolean`) and default values for cells when new rows are created or cells are missing.
    *   **`ValuesSchema`:** Allows defining types and default values for individual "global" values in a Store.
    *   **Type Enforcement:** When a schema is applied to a Store, TinyBase will attempt to coerce incoming data (e.g., from a client synchronization message) to the defined types. If coercion fails (e.g., trying to set a string where a number is expected), the change may be rejected or handled according to TinyBase's rules, thus preventing type-related data corruption.

*   **Current `SyncObject` and Schema Usage:**
    The provided `src/index.ts` code focuses on the `fetch` handler and the setup of the `SyncObject` as a Durable Object export. It **does not show the internal implementation of the `SyncObject` class itself**, including its constructor or how the `MergeableStore` is initialized.
    Therefore, it's not possible to confirm from `src/index.ts` alone whether a `TablesSchema` or `ValuesSchema` is currently defined and applied to the `MergeableStore` within `SyncObject`. Given that it's not explicitly shown, it's prudent to assume one might not be in place or to verify its existence.

*   **Recommendation for Schema Implementation (Server-Side):**
    It is **strongly recommended** to define and apply a `TablesSchema` (and/or `ValuesSchema`, if `Values` are used) to the `MergeableStore` instance within the `SyncObject` on the server side.
    *   **Why:** This acts as a server-side guarantee of data structure and types, protecting against malformed data sent by clients (whether intentionally or unintentionally). It ensures data integrity before it's persisted or synchronized to other clients.
    *   **Where to Implement:**
        *   The schema should be defined (likely as a constant).
        *   The `MergeableStore` should be created, and then the schema should be set on it using `store.setTablesSchema(yourSchema)` (or `store.setValuesSchema(yourValuesSchema)`). This typically happens inside the `SyncObject`'s constructor or during the lazy initialization of the store when the DO is first accessed or after it's loaded by the persister.
        ```typescript
        // Example conceptual placement within SyncObject (actual code depends on WsServerDurableObject structure)
        import { MergeableStore, createMergeableStore, TablesSchema } from 'tinybase';
        import { WsServerDurableObject } from 'tinybase/synchronizers/synchronizer-ws-server-durable-object';
        // ... other imports

        const MY_APP_SCHEMA: TablesSchema = {
          todos: { // Example table
            text: { type: 'string', default: '' },
            completed: { type: 'boolean', default: false },
            createdAt: {type: 'number', default: 0 }
          },
          // ... other tables
        };

        export class SyncObject extends WsServerDurableObject {
          private store: MergeableStore | undefined;

          constructor(state: DurableObjectState, env: Env) {
            super(state, env); // Or however WsServerDurableObject is initialized
            // ...
            // It's common to initialize the store lazily or load it via a persister.
            // The schema should be applied after the store is created.
          }

          private async getStore(): Promise<MergeableStore> {
            if (!this.store) {
              this.store = createMergeableStore('storeFor-' + this.env.DO_ID); // DO_ID or similar unique ID
              this.store.setTablesSchema(MY_APP_SCHEMA); // APPLY SCHEMA HERE

              // Initialize persister here if not already handled by WsServerDurableObject
              // Example:
              // const persister = createDurableObjectStoragePersister(this.store, this.state.storage);
              // await persister.load(); // Load existing data
              // persister.startAutoSave();
            }
            return this.store;
          }

          // ... WsServerDurableObject might handle store creation and persistence internally.
          // If so, find the point where the store is accessible to set the schema.
          // If WsServerDurableObject itself doesn't expose a way to set a schema on its
          // internally managed store before synchronization starts, this might require
          // extending or modifying its behavior, or ensuring the store is passed in
          // already configured with a schema.
        }
        ```

## 3. Input Content Sanitization (XSS Prevention)

While TinyBase schemas are excellent for type enforcement and structural integrity, they do **not** perform sanitization of string content for potential XSS vectors.

*   **Schema vs. Sanitization:**
    A schema might define a cell as `type: 'string'`. TinyBase ensures it *is* a string, but it does not inspect or alter that string to remove or escape HTML tags, JavaScript code, or other malicious content. If a client sends `<script>alert('XSS')</script>` as a string value for a cell, TinyBase will store it as such if the schema type is `string`.

*   **Risk of Stored Cross-Site Scripting (XSS):**
    If data synchronized via TinyBase (which could originate from any connected and authorized client) contains malicious strings (e.g., HTML/JavaScript) and this data is then rendered directly into the DOM by the frontend application without proper sanitization, it can lead to Stored XSS vulnerabilities.
    *   **Example Scenario:**
        1.  Attacker Client A sets a todo item's text to: `"<img src=x onerror=alert(document.cookie)>"`.
        2.  This malicious string is synced via TinyBase to the server (`SyncObject`) and then to Client B.
        3.  Client B's frontend code takes this string from its local TinyBase store and renders it: `parentElement.innerHTML = "Todo: " + todo.text;`.
        4.  The malicious script executes in Client B's browser in the context of the application.

*   **Responsibility for Sanitization Lies with the Frontend:**
    It is unequivocally the **responsibility of the frontend application code** to sanitize or correctly encode any data retrieved from TinyBase before rendering it into the HTML DOM.
    *   **Never use `innerHTML` with raw data from TinyBase (or any untrusted source).**
    *   Use safe alternatives like `textContent` to render data as plain text.
    *   If HTML rendering is required, use trusted templating libraries that provide context-aware output encoding or sanitization (e.g., Lit, React, Vue, Angular all handle this by default for string bindings).
    *   For manually constructing HTML, ensure values are properly HTML-encoded (e.g., `&` becomes `&amp;`, `<` becomes `&lt;`).

## 4. Recommendations Summary

To enhance the security of TinyBase data synchronization and usage in this application:

1.  **Implement Server-Side Schemas:**
    *   Define and apply a `TablesSchema` (and/or `ValuesSchema`) to the `MergeableStore` within the `SyncObject` Durable Object. This is crucial for server-side data type enforcement and structural integrity.

2.  **Thorough Frontend Sanitization Review (XSS Prevention):**
    *   **Crucial:** Conduct a comprehensive review of all frontend code where data originating from TinyBase is rendered into the DOM.
    *   Ensure that appropriate XSS prevention techniques are consistently employed:
        *   Prefer `element.textContent = data;` over `element.innerHTML = data;` for inserting textual data.
        *   If data needs to be rendered as HTML, use a recognized sanitization library or ensure your frontend framework's templating system handles this securely by default.
        *   Be especially careful with attributes that can execute JavaScript (e.g., `href="javascript:..."`, `onerror`, `onload`).

By implementing server-side schemas and ensuring robust frontend sanitization, the application can maintain data integrity and protect against common web vulnerabilities like XSS.
