const INSTALL_KEY = "karrie-install";
const INSTALL_ID = /^[A-Za-z0-9_-]{16,64}$/;

type Token = { value: string; exp: number };

export type SessionDeps = {
  fetch: typeof fetch;
  origin: string;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  now?: () => number;
};

function randomId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, "");
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9]/gi, "").slice(0, 32);
}

export function installId(storage: Pick<Storage, "getItem" | "setItem"> | null): string {
  const existing = storage?.getItem(INSTALL_KEY) ?? "";
  if (INSTALL_ID.test(existing)) return existing;
  const created = randomId();
  storage?.setItem(INSTALL_KEY, created);
  return created;
}

export function createApiSession(deps: SessionDeps) {
  const now = deps.now ?? Date.now;
  let token: Token | null = null;
  let pending: Promise<string | null> | null = null;

  async function mint(): Promise<string | null> {
    const id = installId(deps.storage);
    const base = deps.origin.replace(/\/$/, "");
    try {
      const response = await deps.fetch(`${base}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ installId: id }),
      });
      const body = (await response.json().catch(() => null)) as { status?: string; token?: string; expiresAt?: string; installId?: string } | null;
      if (!response.ok || body?.status !== "ok" || !body.token || !body.expiresAt) return null;
      if (body.installId && INSTALL_ID.test(body.installId) && body.installId !== id) deps.storage?.setItem(INSTALL_KEY, body.installId);
      const exp = Date.parse(body.expiresAt);
      if (!Number.isFinite(exp)) return null;
      token = { value: body.token, exp };
      return body.token;
    } catch {
      return null;
    }
  }

  function ensure(): Promise<string | null> {
    if (token && token.exp > now() + 60_000) return Promise.resolve(token.value);
    if (!pending) {
      pending = mint().finally(() => {
        pending = null;
      });
    }
    return pending;
  }

  function forget() {
    token = null;
  }

  return { ensure, forget, installId: () => installId(deps.storage) };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function isAppApi(input: RequestInfo | URL, origin: string): boolean {
  const url = requestUrl(input);
  if (url.startsWith("/api/") || url === "/api") return true;
  const base = origin.replace(/\/$/, "");
  return base !== "" && (url === base || url.startsWith(`${base}/`));
}

/** Adds a short-lived app token to Karrie API calls and retries once after a 401. */
export function createApiFetch(deps: SessionDeps) {
  const session = createApiSession(deps);

  return async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (!isAppApi(input, deps.origin) || requestUrl(input).includes("/api/session")) return deps.fetch(input, init);
    const headers = new Headers(init?.headers);
    if (!headers.has("Authorization")) {
      const bearer = await session.ensure();
      if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
    }
    const next = { ...init, headers, credentials: init?.credentials ?? "omit", referrerPolicy: init?.referrerPolicy ?? "no-referrer" } as RequestInit;
    const response = await deps.fetch(input, next);
    if (response.status !== 401) return response;
    const body = (await response.clone().json().catch(() => null)) as { code?: string } | null;
    if (body?.code !== "session") return response;
    session.forget();
    const bearer = await session.ensure();
    if (!bearer) return response;
    headers.set("Authorization", `Bearer ${bearer}`);
    return deps.fetch(input, { ...next, headers });
  };
}

function browserStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const apiFetch = createApiFetch({
  fetch: (input, init) => fetch(input, init),
  origin: import.meta.env.VITE_API_ORIGIN ?? "",
  storage: browserStorage(),
});
