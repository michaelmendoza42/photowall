// Minimal fetch wrapper shared by every typed API helper.
//
// The wall query layer treats every backend call as potentially failing.
// Errors must surface a readable `message`, the HTTP status code, and the
// parsed JSON body (when present) so screen states can branch on a stable
// shape instead of stringifying anonymous Error objects.

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface FetchJsonOptions {
  signal?: AbortSignal;
  searchParams?: URLSearchParams;
}

export async function fetchJson<T>(
  path: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const url = options.searchParams
    ? `${path}?${options.searchParams.toString()}`
    : path;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: options.signal,
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : 'network request failed',
      0,
      null,
    );
  }

  const text = await res.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const detail =
      typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new ApiError(detail, res.status, body);
  }

  return body as T;
}
