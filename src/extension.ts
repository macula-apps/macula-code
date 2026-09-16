import * as vscode from 'vscode';
import { MeshClient } from './mesh/meshClient';
import { CollaborationManager } from './collaboration/collaborationManager';
import { RoomsProvider } from './rooms/roomsProvider';
import { AgentsProvider } from './agents/agentsProvider';
import { ContentProvider } from './content/contentProvider';
import { StatusBarManager } from './status/statusBarManager';

let meshClient: MeshClient | undefined;
let collaborationManager: CollaborationManager | undefined;
let roomsProvider: RoomsProvider | undefined;
let agentsProvider: AgentsProvider | undefined;
let contentProvider: ContentProvider | undefined;
let statusBar: StatusBarManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[Macula] Activating Macula Mesh extension');

  meshClient = new MeshClient(context);
  const client = meshClient;
  context.subscriptions.push(client);

  statusBar = new StatusBarManager(client);
  context.subscriptions.push(statusBar);

  collaborationManager = new CollaborationManager(client);
  context.subscriptions.push(collaborationManager);

  roomsProvider = new RoomsProvider(client);
  agentsProvider = new AgentsProvider(client);
  contentProvider = new ContentProvider(client);

  const roomsTreeView = vscode.window.createTreeView('macula.rooms', {
    treeDataProvider: roomsProvider,
    showCollapseAll: true
  });
  const agentsTreeView = vscode.window.createTreeView('macula.agents', {
    treeDataProvider: agentsProvider,
    showCollapseAll: true
  });
  const contentTreeView = vscode.window.createTreeView('macula.content', {
    treeDataProvider: contentProvider,
    showCollapseAll: true
  });

  context.subscriptions.push(roomsTreeView, agentsTreeView, contentTreeView);

  registerCommands(context, client, roomsProvider, agentsProvider, contentProvider);

  const config = vscode.workspace.getConfiguration('macula');
  if (config.get<boolean>('autoConnect', true)) {
    await client.connect();
  }

  updateContextKeys(client);
  client.onConnectionChange(() => updateContextKeys(client));

  console.log('[Macula] Extension activated');
}

export function deactivate(): void {
  console.log('[Macula] Deactivating Macula Mesh extension');
  meshClient?.disconnect();
  collaborationManager?.dispose();
}

function registerCommands(
  context: vscode.ExtensionContext,
  client: MeshClient,
  roomsProvider: RoomsProvider,
  agentsProvider: AgentsProvider,
  contentProvider: ContentProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('macula.connect', async () => {
      await client.connect();
      updateContextKeys(client);
    }),

    vscode.commands.registerCommand('macula.disconnect', async () => {
      await client.disconnect();
      updateContextKeys(client);
    }),

    vscode.commands.registerCommand('macula.openRoom', async () => {
      if (!client.isConnected()) {
        vscode.window.showErrorMessage('Not connected to mesh');
        return;
      }
      const purpose = await vscode.window.showInputBox({
        prompt: 'Room purpose (one line)',
        placeHolder: 'Code review for PR #42',
        validateInput: (value) => value.length > 0 ? null : 'Purpose required'
      });
      if (purpose) {
        await roomsProvider.openRoom(purpose);
      }
    }),

    vscode.commands.registerCommand('macula.joinRoom', async () => {
      if (!client.isConnected()) {
        vscode.window.showErrorMessage('Not connected to mesh');
        return;
      }
      const topic = await vscode.window.showInputBox({
        prompt: 'Room topic (agents.room.<hex>)',
        placeHolder: 'agents.room.a1b2c3d4...',
        validateInput: (value) => value.startsWith('agents.room.') ? null : 'Must be a valid room topic'
      });
      if (topic) {
        await roomsProvider.joinRoom(topic);
      }
    }),

    vscode.commands.registerCommand('macula.shareSnippet', async () => {
      if (!client.isConnected()) {
        vscode.window.showErrorMessage('Not connected to mesh');
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }
      const selection = editor.selection;
      const text = selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(selection);
      if (!text.trim()) {
        vscode.window.showErrorMessage('No content to share');
        return;
      }
      const name = await vscode.window.showInputBox({
        prompt: 'Snippet name (optional)',
        placeHolder: 'my-snippet.ts'
      });
      await contentProvider.shareSnippet(text, name || undefined);
    }),

    vscode.commands.registerCommand('macula.fetchSnippet', async () => {
      if (!client.isConnected()) {
        vscode.window.showErrorMessage('Not connected to mesh');
        return;
      }
      const mcid = await vscode.window.showInputBox({
        prompt: 'MCID (68 hex chars)',
        placeHolder: '0123456789abcdef...',
        validateInput: (value) => /^[0-9a-f]{68}$/.test(value) ? null : 'Invalid MCID format'
      });
      if (mcid) {
        await contentProvider.fetchSnippet(mcid);
      }
    }),

    vscode.commands.registerCommand('macula.callAgent', async () => {
      if (!client.isConnected()) {
        vscode.window.showErrorMessage('Not connected to mesh');
        return;
      }
      const procedure = await vscode.window.showQuickPick(
        ['hecate-rag.query', 'hecate-llm.complete', 'hecate-dns.resolve', 'hecate-git.search'],
        { placeHolder: 'Select agent procedure' }
      );
      if (!procedure) return;

      const payloadStr = await vscode.window.showInputBox({
        prompt: `JSON payload for ${procedure}`,
        placeHolder: '{"query": "how to implement CRDT"}'
      });
      if (!payloadStr) return;

      try {
        const payload = JSON.parse(payloadStr);
        const result = await agentsProvider.callAgent(procedure, payload);
        const doc = await vscode.workspace.openTextDocument({
          content: JSON.stringify(result, null, 2),
          language: 'json'
        });
        await vscode.window.showTextDocument(doc);
      } catch (e) {
        vscode.window.showErrorMessage(`Agent call failed: ${e}`);
      }
    })
  );
}

function updateContextKeys(client: MeshClient): void {
  vscode.commands.executeCommand('setContext', 'macula.connected', client.isConnected());
}