import { USER_AGENT } from "./config.js";
import { RemoteSourceError } from "./errors.js";

export class HttpClient {
  private lastRequestAt = 0;

  constructor(private readonly minDelayMs = 1000) {}

  async fetchText(url: string, init?: RequestInit): Promise<string> {
    const response = await this.fetch(url, init);
    return response.text();
  }

  async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetch(url, init);
    return response.json() as Promise<T>;
  }

  async fetchArrayBuffer(url: string, init?: RequestInit): Promise<ArrayBuffer> {
    const response = await this.fetch(url, init);
    return response.arrayBuffer();
  }

  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    const waitMs = this.lastRequestAt + this.minDelayMs - Date.now();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const response = await fetch(url, {
      ...init,
      headers: {
        "user-agent": USER_AGENT,
        accept: "*/*",
        ...(init?.headers ?? {})
      }
    });

    this.lastRequestAt = Date.now();

    if (!response.ok) {
      throw new RemoteSourceError(`Remote source failed (${response.status}) for ${url}`);
    }

    return response;
  }
}
