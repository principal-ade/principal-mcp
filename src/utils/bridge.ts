import type { McpServerConfig } from '../types';

export interface BridgeResponse {
  ok: boolean;
  status: number;
  data: unknown;
}

export async function bridgeRequest(
  config: McpServerConfig,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string | number | boolean | undefined>,
): Promise<BridgeResponse> {
  const bridgeHost = config.bridgeHost ?? 'localhost';
  const bridgePort = config.bridgePort ?? 3044;
  const protocol = process.env.PRINCIPLE_MCP_PROTOCOL ?? 'http';

  const normalizedBase = (config.bridgePath ?? '').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullPath = `${normalizedBase}${normalizedPath}`;

  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  const url = `${protocol}://${bridgeHost}:${bridgePort}${fullPath}${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = await response.text().catch(() => null);
  }

  return { ok: response.ok, status: response.status, data };
}

export function bridgeBaseUrl(config: McpServerConfig): string {
  const bridgeHost = config.bridgeHost ?? 'localhost';
  const bridgePort = config.bridgePort ?? 3044;
  const protocol = process.env.PRINCIPLE_MCP_PROTOCOL ?? 'http';
  const normalizedBase = (config.bridgePath ?? '').replace(/\/$/, '');
  return `${protocol}://${bridgeHost}:${bridgePort}${normalizedBase}`;
}