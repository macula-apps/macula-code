import * as vscode from "vscode";
import type { JsonValue, PubsubEvent } from "@macula-io/ts";
import { MeshClient } from "../mesh/meshClient";

/**
 * Real-time collaborative editing over mesh pubsub. Local edits are
 * published as (path, offset, removed, inserted) envelopes on
 * `macula.code.edits`; remote envelopes are applied to the matching
 * open document at the same offsets. Conflicts resolve last-write-wins
 * by arrival order — the honest v0.1 semantics, fine for a demo-scale
 * mesh, to be replaced by a sequence-aware sync if sessions grow.
 */
interface EditEnvelope {
  [key: string]: unknown;
  path: string;
  offset: number;
  removed: string;
  inserted: string;
  from: string;
}

const EDITS_TOPIC = "macula.code.edits";

export class CollaborationManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private unsubscribe: (() => Promise<void>) | undefined;
  private ownNodeId: string | undefined;

  constructor(private client: MeshClient) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => void this.onLocalChange(e)),
    );
    this.disposables.push(this.client.onConnectionChange(() => void this.onConnectionChange()));
    void this.onConnectionChange();
  }

  private async onConnectionChange(): Promise<void> {
    if (!vscode.workspace.getConfiguration("macula").get("enableCollaboration", true)) {
      return;
    }
    if (!this.client.isConnected()) {
      return;
    }
    if (this.unsubscribe) {
      return;
    }
    const identity = this.client.getIdentity();
    if (!identity) {
      return;
    }
    this.ownNodeId = Buffer.from(identity.nodeId).toString("hex");
    this.unsubscribe = await this.client.subscribe(undefined, EDITS_TOPIC, (evt) =>
      void this.onRemoteEdit(evt),
    );
  }

  private async onLocalChange(e: vscode.TextDocumentChangeEvent): Promise<void> {
    if (!this.client.isConnected() || !this.unsubscribe || !this.ownNodeId) {
      return;
    }
    for (const change of e.contentChanges) {
      if (change.rangeOffset === undefined) {
        continue;
      }
      const envelope: EditEnvelope = {
        path: e.document.uri.fsPath,
        offset: change.rangeOffset,
        removed: e.document.getText().slice(change.rangeOffset, change.rangeOffset + change.rangeLength),
        inserted: change.text,
        from: this.ownNodeId,
      };
      await this.client.publish(undefined, EDITS_TOPIC, envelope as unknown as JsonValue);
    }
  }

  private async onRemoteEdit(evt: PubsubEvent): Promise<void> {
    const envelope = evt.payload as unknown as EditEnvelope;
    if (envelope.from === this.ownNodeId) {
      return;
    }
    const document = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === envelope.path);
    if (!document) {
      return;
    }
    const text = document.getText();
    const start = document.positionAt(Math.min(envelope.offset, text.length));
    const end = document.positionAt(Math.min(envelope.offset + envelope.removed.length, text.length));
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(start, end), envelope.inserted);
    await vscode.workspace.applyEdit(edit);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    if (this.unsubscribe) {
      void this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }
}
