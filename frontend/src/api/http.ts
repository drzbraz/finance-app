/** All backend calls go to the same origin under /api (nginx in Docker, the Vite proxy in dev). */
export const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Sends JSON (or a FormData upload) and returns the parsed JSON response; 204 → undefined. */
export async function request<T = void>(method: Method, path: string, body?: unknown): Promise<T> {
  const response = await send(method, path, body);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Same as `request`, for endpoints that answer with a file. */
export async function requestFile(method: Method, path: string): Promise<Response> {
  return send(method, path);
}

async function send(method: Method, path: string, body?: unknown): Promise<Response> {
  const isUpload = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined || isUpload ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isUpload ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Servidor indisponível. Ele está rodando? (npm run up)');
  }
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
  return response;
}

/** Nest answers errors as { message: string | string[] }. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const { message } = (await response.json()) as { message?: string | string[] };
    if (message) return Array.isArray(message) ? message.join('; ') : message;
  } catch {
    // Not JSON: fall back to the status text.
  }
  return `Erro ${response.status} ${response.statusText}`.trim();
}

export const encode = encodeURIComponent;
