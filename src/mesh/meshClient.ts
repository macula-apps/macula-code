import * as vscode from "vscode";
import { EventEmitter } from "events";
import { Identity, Pool, Session, type JsonValue, type PubsubEvent, type Seed } from "@macula-io/ts";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { deriveRealmTag } from "./realm.js";

export interface MeshConfig {
  stationHost: string;
  stationPort: number;
  realm: string;
  identityPath: string;
}

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export type ConnectionChangeSubscription = { dispose(): void };

export class MeshClient extends EventEmitter {
  private config!: MeshConfig;
  private pool: Pool | undefined;
  private contentSession: Session | undefined;
  private controlIdentity: Identity | undefined;
  private state: ConnectionState = "disconnected";

  constructor(_context: vscode.ExtensionContext) {
    super();
    this.loadConfig();
    this.loadOrCreateIdentity();
  }

  private loadConfig(): void {
    const config = vscode.workspace.getConfiguration("macula");
    this.config = {
      stationHost: config.get<string>("stationHost") || "station-de-frankfurt.macula.io",
      stationPort: config.get<number>("stationPort") || 4433,
      realm: config.get<string>("realm") || "",
      identityPath: config.get<string>("identityPath") || "~/.macula-code/identity.json",
    };
  }

  private resolveIdentityPath(): string {
    const p = this.config.identityPath;
    return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
  }

  /**
   * Load the persisted Ed25519 identity, or mint and persist one. A
   * corrupt or unreadable file is replaced by a freshly minted identity
   * that IS persisted — loudly, because the node id changes and any
   * peer that knew the old one will see a stranger. Only when the
   * replacement cannot be persisted either does the client fall back to
   * an ephemeral key, and connect() refuses to run on one.
   */
  private loadOrCreateIdentity(): void {
    const identityPath = this.resolveIdentityPath();
    try {
      const dir = path.dirname(identityPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      if (fs.existsSync(identityPath)) {
        const data = JSON.parse(fs.readFileSync(identityPath, "utf-8"));
        this.controlIdentity = Identity.fromSeedBytes(new Uint8Array(data.seed));
        fs.chmodSync(identityPath, 0o600);
        console.log("[Macula] Loaded identity:", this.nodeIdHex());
      } else {
        this.controlIdentity = this.persistIdentity(identityPath, Identity.generate());
        console.log("[Macula] Generated new identity:", this.nodeIdHex());
      }
    } catch (e) {
      console.error(`[Macula] identity at ${identityPath} unreadable, rotating:`, e);
      try {
        this.controlIdentity = this.persistIdentity(identityPath, Identity.generate());
        console.log("[Macula] Rotated identity:", this.nodeIdHex());
      } catch (persistError) {
        console.error("[Macula] could not persist a replacement identity:", persistError);
        this.controlIdentity = Identity.generate();
        this.state = "error";
      }
    }
  }

  private persistIdentity(identityPath: string, id: Identity): Identity {
    fs.writeFileSync(
      identityPath,
      JSON.stringify({ seed: Array.from(id.privateSeedBytes) }),
      { mode: 0o600 },
    );
    fs.chmodSync(identityPath, 0o600);
    return id;
  }

  async connect(): Promise<void> {
    if (this.state === "connected" || this.state === "connecting") {
      return;
    }
    if (this.state === "error") {
      vscode.window.showErrorMessage(
        "Macula: identity could not be persisted — fix the identity file permissions and retry",
      );
      throw new Error("identity persistence failed");
    }

    this.setState("connecting");
    const seeds: Seed[] = [{ host: this.config.stationHost, port: this.config.stationPort }];
    try {
      this.pool = await Pool.connect(seeds, this.controlIdentity!);
      this.setState("connected");
      vscode.window.showInformationMessage(
        `Connected to Macula mesh at ${this.config.stationHost}:${this.config.stationPort}`,
      );
    } catch (e) {
      this.setState("error");
      vscode.window.showErrorMessage(`Failed to connect to mesh: ${e}`);
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = undefined;
    }
    await this.closeContentSession();
    this.setState("disconnected");
  }

  /** Content transfer rides its own Session (a dedicated QUIC stream
   * per operation), so it is opened lazily and closed with the pool. */
  private async content(): Promise<Session> {
    if (!this.contentSession) {
      if (!this.isConnected()) {
        throw new Error("not connected to mesh");
      }
      this.contentSession = await Session.connect(
        this.config.stationHost,
        this.config.stationPort,
        this.controlIdentity!,
      );
    }
    return this.contentSession;
  }

  private async closeContentSession(): Promise<void> {
    if (this.contentSession) {
      await this.contentSession.close(this.controlIdentity!).catch((e) => {
        console.error("[Macula] closing the content session failed:", e);
      });
      this.contentSession = undefined;
    }
  }

  async putContent(bytes: Uint8Array, name = ""): Promise<string> {
    const session = await this.content();
    const { mcid } = await session.putContent(bytes, name);
    return mcid;
  }

  async getContent(mcid: string): Promise<Uint8Array> {
    const session = await this.content();
    return session.getContent(mcid);
  }

  async publish(realm: string | undefined, topic: string, payload: JsonValue): Promise<void> {
    const pool = this.requirePool();
    await pool.publish(realm, topic, payload);
  }

  async subscribe(
    realm: string | undefined,
    topic: string,
    handler: (evt: PubsubEvent) => void,
  ): Promise<() => Promise<void>> {
    const pool = this.requirePool();
    return pool.subscribe(realm, topic, handler);
  }

  async call(procedure: string, payload: JsonValue): Promise<JsonValue> {
    const pool = this.requirePool();
    return pool.call(this.getRealm(), procedure, payload, { deadlineMs: 30_000 });
  }

  private requirePool(): Pool {
    if (!this.pool || !this.isConnected()) {
      throw new Error("not connected to mesh");
    }
    return this.pool;
  }

  isConnected(): boolean {
    return this.state === "connected" && this.pool !== undefined;
  }

  getPool(): Pool | undefined {
    return this.pool;
  }

  getIdentity(): Identity | undefined {
    return this.controlIdentity;
  }

  /** The realm tag every operation runs under: 64 lowercase hex chars,
   * or undefined for the all-zero realm. Derived from the configured
   * realm name (SHA-256) or passed through when already a tag. */
  getRealm(): string | undefined {
    return deriveRealmTag(this.config.realm);
  }

  getState(): ConnectionState {
    return this.state;
  }

  nodeIdHex(): string {
    return Buffer.from(this.controlIdentity!.nodeId).toString("hex");
  }

  onConnectionChange(callback: () => void): ConnectionChangeSubscription {
    this.on("connectionChange", callback);
    return { dispose: () => this.removeListener("connectionChange", callback) };
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.emit("connectionChange");
  }

  async dispose(): Promise<void> {
    await this.disconnect();
  }
}
