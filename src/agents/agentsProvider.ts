import * as vscode from "vscode";
import type { JsonValue } from "@macula-io/ts";
import { MeshClient } from "../mesh/meshClient";

const DEFAULT_AGENTS = [
  "hecate-rag.query",
  "hecate-llm.complete",
  "hecate-dns.resolve",
  "hecate-git.search",
];

/** The "Mesh Agents" tree: one row per configured agent procedure, with
 * the tail of its last reply as the description. */
export class AgentsProvider implements vscode.TreeDataProvider<AgentItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private procedures: string[];
  private lastReplies = new Map<string, string>();

  constructor(private client: MeshClient) {
    const configured = vscode.workspace
      .getConfiguration("macula")
      .get<string[]>("agents", DEFAULT_AGENTS);
    this.procedures = configured.length > 0 ? configured : DEFAULT_AGENTS;
  }

  getTreeItem(element: AgentItem): vscode.TreeItem {
    return element;
  }

  getChildren(): AgentItem[] {
    return this.procedures.map(
      (procedure) => new AgentItem(procedure, this.lastReplies.get(procedure)),
    );
  }

  async callAgent(procedure: string, payload: JsonValue): Promise<JsonValue> {
    const result = await this.client.call(procedure, payload);
    this.lastReplies.set(procedure, JSON.stringify(result).slice(0, 160));
    this._onDidChangeTreeData.fire();
    return result;
  }
}

export class AgentItem extends vscode.TreeItem {
  constructor(procedure: string, lastReply: string | undefined) {
    super(procedure);
    this.description = lastReply ?? "not called yet";
    this.tooltip = `Call ${procedure} on the mesh`;
    this.command = {
      command: "macula.callAgent",
      title: "Call agent",
      arguments: [procedure],
    };
  }
}
