import { AddressInfo } from 'net';
import { createServer, Server } from 'http';
import { TestSigningKey, jwksDocument } from './token-factory';

/**
 * A minimal stand-in for the Core Hub JWKS endpoint, used by the e2e suite.
 * It serves ONLY public keys - exactly what the real Core Hub exposes.
 */
export class FakeCoreHub {
  private server?: Server;
  private keys: TestSigningKey[] = [];

  requestCount = 0;

  async start(keys: TestSigningKey[]): Promise<void> {
    this.keys = keys;
    this.server = createServer((req, res) => {
      if (req.url?.startsWith('/api/v1/.well-known/jwks.json')) {
        this.requestCount += 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(jwksDocument(this.keys)));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });

    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
  }

  /** Simulates Core Hub key rotation. */
  rotate(keys: TestSigningKey[]): void {
    this.keys = keys;
  }

  get port(): number {
    return (this.server!.address() as AddressInfo).port;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  get jwksUrl(): string {
    return `${this.url}/api/v1/.well-known/jwks.json`;
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) =>
        this.server!.close((error) => (error ? reject(error) : resolve())),
      );
      this.server = undefined;
    }
  }
}
