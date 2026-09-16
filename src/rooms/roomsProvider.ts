import * as vscode from "vscode";
import * as crypto from "crypto";
import type { PubsubEvent } from "@macula-io/ts";
import { MeshClient } from "../mesh/meshClient";

/**
 * Rooms are unguessable `agents.room.<32 hex>` pubsub topics carrying
 * conversation envelopes, the same convention macula-mcp uses. This
 * provider opens and joins them, tracks the participants seen on each
 * room and shows the last message under the room's topic.
 */
interface RoomEnvelope {
  kind?: string;
  text?: string;
  from?: string;
  sent_at?: number;
}

interface RoomState {
  topic: string;
  purpose: string;
  participants: Set<string>;
  lastMessage: string;
  unsubscribe?: () => Promise<void>;
}

export class RoomsProvider implements vscode.TreeDataProvider<RoomItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private rooms = new Map<string, RoomState>();

  constructor(private client: MeshClient) {
    this.client.onConnectionChange(() => {
      this.rooms.clear();
      this._onDidChangeTreeData.fire();
    });
  }

  getTreeItem(element: RoomItem): vscode.TreeItem {
    return element;
  }

  getChildren(): RoomItem[] {
    return [...this.rooms.values()].map((room) => new RoomItem(room));
  }

  async openRoom(purpose: string): Promise<string> {
    const topic = "agents.room." + crypto.randomBytes(16).toString("hex");
    await this.join(topic);
    await this.publish(topic, { kind: "room_opened", text: purpose });
    vscode.window.showInformationMessage(`Room opened: ${topic}`);
    return topic;
  }

  async joinRoom(topic: string): Promise<void> {
    await this.join(topic);
    await this.publish(topic, { kind: "participant_joined" });
    vscode.window.showInformationMessage(`Joined room: ${topic}`);
  }

  private async join(topic: string): Promise<void> {
    if (this.rooms.has(topic)) {
      return;
    }
    const room: RoomState = { topic, purpose: "", participants: new Set(), lastMessage: "" };
    this.rooms.set(topic, room);
    room.unsubscribe = await this.client.subscribe(undefined, topic, (evt) =>
      this.onEnvelope(room, evt),
    );
    this._onDidChangeTreeData.fire();
  }

  private onEnvelope(room: RoomState, evt: PubsubEvent): void {
    const envelope = evt.payload as RoomEnvelope;
    if (envelope.kind === "room_opened" && envelope.text) {
      room.purpose = envelope.text;
    }
    if (envelope.from) {
      room.participants.add(envelope.from);
    }
    if (envelope.text && envelope.kind !== "room_opened") {
      room.lastMessage = envelope.text;
    }
    this._onDidChangeTreeData.fire();
  }

  private async publish(topic: string, envelope: RoomEnvelope): Promise<void> {
    const identity = this.client.getIdentity();
    const from = identity ? Buffer.from(identity.nodeId).toString("hex") : undefined;
    await this.client.publish(undefined, topic, {
      ...envelope,
      ...(from ? { from } : {}),
      sent_at: Date.now(),
    });
  }
}

export class RoomItem extends vscode.TreeItem {
  constructor(room: RoomState) {
    super(room.purpose || room.topic.slice(0, 30) + "…");
    this.description = `${room.participants.size} participant(s)`;
    this.tooltip = room.lastMessage ? `${room.topic}\nlast: ${room.lastMessage}` : room.topic;
  }
}
