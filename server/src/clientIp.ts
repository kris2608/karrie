import type { IncomingMessage } from "node:http";

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(",");
  return value ?? "";
}

/** Drop a port and the IPv4-mapped IPv6 prefix so one client is one key. */
export function normalizeIp(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("::ffff:")) value = value.slice("::ffff:".length);
  if (value.startsWith("[") && value.includes("]")) value = value.slice(1, value.indexOf("]"));
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  return v4 ? v4[1] : value;
}

function looksLikeIp(value: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return true;
  return value.includes(":") && /^[0-9a-f:]+$/i.test(value);
}

/**
 * Client address as seen by the closest proxy.
 * Render appends the connecting IP as the rightmost X-Forwarded-For hop, so a
 * spoofed first entry is ignored. With no forwarding header, the socket address is used.
 */
export function clientIp(req: IncomingMessage): string {
  const hops = headerValue(req.headers["x-forwarded-for"])
    .split(",")
    .map((part) => normalizeIp(part))
    .filter(looksLikeIp);
  if (hops.length) return hops[hops.length - 1];
  const remote = normalizeIp(req.socket?.remoteAddress ?? "");
  return looksLikeIp(remote) ? remote : "unknown";
}
