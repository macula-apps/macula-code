import * as vscode from "vscode";
import { MeshClient } from "../mesh/meshClient";

/** The Macula status bar item: shows the connection state, clicks to
 * connect or disconnect. */
export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private subscription: { dispose(): void };

  constructor(private client: MeshClient) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.subscription = this.client.onConnectionChange(() => this.refresh());
    this.refresh();
    this.item.show();
  }

  private refresh(): void {
    const connected = this.client.isConnected();
    this.item.text = connected ? "$(radio-tower) Macula: connected" : "$(circle-slash) Macula: offline";
    this.item.tooltip = connected ? "Connected to the Macula mesh" : "Connect to the Macula mesh";
    this.item.command = connected ? "macula.disconnect" : "macula.connect";
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }
}
