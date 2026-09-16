import * as vscode from "vscode";
import { ContentNotFoundError } from "@macula-io/ts";
import { MeshClient } from "../mesh/meshClient";

/** The "Mesh Content" tree: snippets shared as content-addressed blobs
 * (MCID), fetchable by anyone the MCID reaches. */
export class ContentProvider implements vscode.TreeDataProvider<ContentItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private items: ContentItem[] = [];

  constructor(private client: MeshClient) {}

  getTreeItem(element: ContentItem): vscode.TreeItem {
    return element;
  }

  getChildren(): ContentItem[] {
    return this.items;
  }

  async shareSnippet(text: string, name?: string): Promise<void> {
    const mcid = await this.client.putContent(new TextEncoder().encode(text), name ?? "vscode snippet");
    await vscode.env.clipboard.writeText(mcid);
    vscode.window.showInformationMessage(`Snippet stored as ${mcid} (copied to clipboard)`);
    this.items.unshift(new ContentItem(name ?? mcid.slice(0, 12), mcid));
    this._onDidChangeTreeData.fire();
  }

  async fetchSnippet(mcid: string): Promise<void> {
    try {
      const bytes = await this.client.getContent(mcid);
      const document = await vscode.workspace.openTextDocument({
        content: new TextDecoder().decode(bytes),
        language: "plaintext",
      });
      await vscode.window.showTextDocument(document);
    } catch (e) {
      if (e instanceof ContentNotFoundError) {
        vscode.window.showErrorMessage(`No content found for ${mcid}`);
        return;
      }
      throw e;
    }
  }
}

export class ContentItem extends vscode.TreeItem {
  constructor(label: string, public readonly mcid: string) {
    super(label);
    this.description = mcid;
    this.tooltip = `Fetch ${mcid} from the mesh`;
    this.command = {
      command: "macula.fetchSnippet",
      title: "Fetch snippet",
      arguments: [mcid],
    };
  }
}
