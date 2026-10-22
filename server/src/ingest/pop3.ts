// A small POP3 client written on Node's own net / tls modules (no extra library).
// Why not poplib? poplib hands messages back as text, which can corrupt non-English characters.
// Here the raw message BYTES go straight to the mail parser.
//
// Only what we need: connect (plain port 110 or TLS port 995), USER/PASS, UIDL + LIST, RETR, QUIT.
// Messages are never deleted from the mailbox.
import net from "node:net";
import tls from "node:tls";
import { config } from "../config/env";

export interface Pop3Options {
  host: string;
  port: number;
  tls: boolean;
  /** Only for mail servers with a self-signed certificate. Leave false when possible. */
  ignoreTlsErrors?: boolean;
  timeoutMs?: number;
}

/** One message in the mailbox. */
export interface MailboxEntry {
  number: number; // its position for this session (RETR uses it)
  uidl: string; // its permanent unique id on the server
  size: number; // bytes
}

/** The connection settings from server/.env. */
export function pop3FromConfig(): Pop3Options {
  return {
    host: config.pop3.host,
    port: config.pop3.port,
    tls: config.pop3.tls,
    ignoreTlsErrors: process.env.POP3_IGNORE_TLS_ERRORS === "true",
  };
}

const MAX_BUFFER = 40 * 1024 * 1024; // refuse to hold more than 40 MB in memory
const END_OF_LIST = Buffer.from("\r\n.\r\n");

/** A server sends "." at the start of a line as ".." (dot-stuffing). This undoes it. Lossless for bytes. */
function unstuff(buf: Buffer): Buffer {
  return Buffer.from(
    buf.toString("latin1").replace(/(^|\r\n)\.\./g, "$1."),
    "latin1",
  );
}

export class Pop3Client {
  private buffer: Buffer = Buffer.alloc(0);
  private failure: Error | null = null;
  private listeners = new Set<() => void>();

  private constructor(
    private socket: net.Socket,
    private timeoutMs: number,
  ) {
    socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      if (this.buffer.length > MAX_BUFFER) {
        this.fail(new Error("The POP3 server sent too much data."));
        socket.destroy();
        return;
      }
      this.wake();
    });
    socket.on("error", (err) => this.fail(err));
    socket.on("close", () =>
      this.fail(new Error("The POP3 connection was closed.")),
    );
  }

  /** Opens the connection and reads the server's greeting. */
  static async connect(o: Pop3Options): Promise<Pop3Client> {
    const timeoutMs = o.timeoutMs ?? 60_000;

    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s: net.Socket = o.tls
        ? tls.connect({
            host: o.host,
            port: o.port,
            servername: o.host,
            rejectUnauthorized: !o.ignoreTlsErrors,
          })
        : net.connect({ host: o.host, port: o.port });

      const onError = (err: Error) => {
        clearTimeout(timer);
        reject(err);
      };
      const timer = setTimeout(() => {
        s.destroy();
        reject(
          new Error(`Could not connect to ${o.host}:${o.port} (timed out).`),
        );
      }, timeoutMs);

      s.once("error", onError);
      s.once(o.tls ? "secureConnect" : "connect", () => {
        clearTimeout(timer);
        s.removeListener("error", onError);
        resolve(s);
      });
    });

    const client = new Pop3Client(socket, timeoutMs);
    try {
      const greeting = await client.readLine("the server greeting");
      if (!greeting.startsWith("+OK"))
        throw new Error(`The POP3 server refused the connection: ${greeting}`);
    } catch (err) {
      client.destroy();
      throw err;
    }
    return client;
  }

  // ---------- low level reading ----------

  private fail(err: Error): void {
    if (!this.failure) this.failure = err;
    this.wake();
  }

  private wake(): void {
    for (const l of [...this.listeners]) l();
  }

  /** Waits until `extract` can take what it needs from the buffer (it returns undefined while it cannot). */
  private waitFor<T>(extract: () => T | undefined, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const attempt = () => {
        const result = extract();
        if (result !== undefined) {
          cleanup();
          resolve(result);
        } else if (this.failure) {
          cleanup();
          reject(this.failure);
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(attempt);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`The POP3 server did not answer in time (${what}).`));
      }, this.timeoutMs);

      this.listeners.add(attempt);
      attempt();
    });
  }

  /** One line of text (without the line break). */
  private readLine(what: string): Promise<string> {
    return this.waitFor(() => {
      const i = this.buffer.indexOf(0x0a);
      if (i === -1) return undefined;
      const line = this.buffer
        .subarray(0, i)
        .toString("latin1")
        .replace(/\r$/, "");
      this.buffer = this.buffer.subarray(i + 1);
      return line;
    }, what);
  }

  /** The data of a multi-line answer, up to the line that holds only a dot. */
  private readMultiline(what: string): Promise<Buffer> {
    return this.waitFor(() => {
      // An empty answer: the data is just ".\r\n"
      if (
        this.buffer.length >= 3 &&
        this.buffer[0] === 0x2e &&
        this.buffer[1] === 0x0d &&
        this.buffer[2] === 0x0a
      ) {
        this.buffer = this.buffer.subarray(3);
        return Buffer.alloc(0);
      }
      const i = this.buffer.indexOf(END_OF_LIST);
      if (i === -1) return undefined;
      const body = Buffer.from(this.buffer.subarray(0, i + 2)); // keeps the line break of the last line
      this.buffer = this.buffer.subarray(i + 5);
      return body;
    }, what);
  }

  private send(line: string): void {
    this.socket.write(`${line}\r\n`);
  }

  /** Sends a command and requires "+OK". The command text is never put in the error (it may hold a password). */
  private async command(line: string, what: string): Promise<string> {
    this.send(line);
    const reply = await this.readLine(what);
    if (!reply.startsWith("+OK"))
      throw new Error(`POP3 ${what} failed: ${reply}`);
    return reply;
  }

  // ---------- what the worker uses ----------

  async login(user: string, pass: string): Promise<void> {
    if (/[\r\n]/.test(user) || /[\r\n]/.test(pass))
      throw new Error("Invalid POP3 user name or password.");
    await this.command(`USER ${user}`, "USER");
    await this.command(`PASS ${pass}`, "PASS (check POP3_USER and POP3_PASS)");
  }

  /** Every message with its permanent id (UIDL) and size. */
  async list(): Promise<MailboxEntry[]> {
    this.send("UIDL");
    const st1 = await this.readLine("UIDL");
    if (!st1.startsWith("+OK"))
      throw new Error(`The POP3 server does not support UIDL: ${st1}`);
    const uidlBody = (await this.readMultiline("the UIDL list")).toString(
      "latin1",
    );

    this.send("LIST");
    const st2 = await this.readLine("LIST");
    if (!st2.startsWith("+OK")) throw new Error(`POP3 LIST failed: ${st2}`);
    const listBody = (await this.readMultiline("the LIST answer")).toString(
      "latin1",
    );

    const sizes = new Map<number, number>();
    for (const line of listBody.split(/\r?\n/)) {
      const m = /^(\d+)\s+(\d+)/.exec(line);
      if (m) sizes.set(Number(m[1]), Number(m[2]));
    }

    const out: MailboxEntry[] = [];
    for (const line of uidlBody.split(/\r?\n/)) {
      const m = /^(\d+)\s+(\S+)/.exec(line);
      if (m) {
        const number = Number(m[1]);
        out.push({ number, uidl: m[2], size: sizes.get(number) ?? 0 });
      }
    }
    return out;
  }

  /** The whole raw message (headers and body) as bytes. */
  async retrieve(number: number): Promise<Buffer> {
    this.send(`RETR ${number}`);
    const status = await this.readLine("RETR");
    if (!status.startsWith("+OK"))
      throw new Error(`POP3 RETR failed: ${status}`);
    return unstuff(await this.readMultiline("the message"));
  }

  /** Politely ends the session. Never throws. */
  async quit(): Promise<void> {
    try {
      this.send("QUIT");
      await this.readLine("QUIT");
    } catch {
      /* the server may simply close the connection */
    } finally {
      this.destroy();
    }
  }

  destroy(): void {
    if (!this.failure)
      this.failure = new Error("The POP3 connection was closed.");
    this.socket.destroy();
  }
}
