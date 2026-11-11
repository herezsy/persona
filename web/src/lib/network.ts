// Sticky Home / Away network paths for the web app (Settings › Network, 组网切换).
// Extends hello `endpoints` / `public_url`: the page stays on its origin (no CORS), so switching opens another
// advertised address of this hub. Other hubs stay under Switch hub. Selection is persisted per origin and only
 // changes in Settings — reconnect and probes never pick another path.

import { getToken } from "./api";
import { BASE } from "./base";
import { here, loadHubs, normalizeHubURL, rememberHub, switchURL } from "./hubs";
import type { MeshHub } from "./types";

/** Last hello's network fields (endpoints / public_url / mesh), kept for Settings › Network. */
let lastHello: NetworkHello | null = null;

export type NetworkMode = "home" | "away";

/** One reachable hub address this browser can open (same hub, different network path). */
export interface NetworkPath {
  /** Canonical hub URL (`scheme://host[:port][/prefix]`), as `normalizeHubURL` writes it. */
  url: string;
  /** `lan` / `ipv6` / `ipv4` / `name` / `unknown`, matching the mobile clients. */
  kind: string;
  /** Where it came from: this page, or an address the hub (or a prior visit) advertised. */
  source: "here" | "hello";
}

const MODE_KEY = "persona.network.mode";
const SELECTED_KEY = "persona.network.selected";
const CANDIDATES_KEY = "persona.network.candidates";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/** Called when sticky mode / selection / candidates change in this tab. */
export function onNetworkChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** `lan` for localhost / private literals; `ipv6` / `ipv4` for other literals; `name` for hosts; else `unknown`. */
export function networkKind(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  if (!host) return "unknown";
  if (host === "localhost" || host.endsWith(".local")) return "lan";
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (isIPv6(host)) return isLocalIPv6(host) ? "lan" : "ipv6";
  if (isIPv4(host)) return isLocalIPv4(host) ? "lan" : "ipv4";
  return "name";
}

export function modeOfKind(kind: string): NetworkMode {
  return kind === "lan" ? "home" : "away";
}

export function modeMatches(mode: NetworkMode, kind: string): boolean {
  return mode === "home" ? kind === "lan" : kind !== "lan";
}

function isIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

function isLocalIPv4(host: string): boolean {
  const [a, b] = host.split(".").map(Number);
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isIPv6(host: string): boolean {
  return host.includes(":") && /^[0-9a-f:.]+$/i.test(host);
}

function isLocalIPv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  if (h.startsWith("fe80:")) return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadNetworkMode(): NetworkMode | null {
  const v = localStorage.getItem(MODE_KEY);
  return v === "home" || v === "away" ? v : null;
}

export function loadSelectedNetwork(): string | null {
  const v = localStorage.getItem(SELECTED_KEY);
  if (!v) return null;
  const n = normalizeHubURL(v);
  return "url" in n ? n.url : null;
}

/** Known paths remembered on this origin (hello + visits), oldest first. */
export function loadCandidateNetworks(): string[] {
  const list = readJSON<unknown>(CANDIDATES_KEY, []);
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const e of list) {
    if (typeof e !== "string") continue;
    const n = normalizeHubURL(e);
    if ("url" in n && !out.includes(n.url)) out.push(n.url);
  }
  return out;
}

function saveCandidates(urls: string[]) {
  const kept = urls.slice(0, 40);
  if (kept.length) localStorage.setItem(CANDIDATES_KEY, JSON.stringify(kept));
  else localStorage.removeItem(CANDIDATES_KEY);
  notify();
}

/** Persist sticky mode + selected URL. Does not navigate. */
export function setStickyNetwork(mode: NetworkMode, selected: string) {
  const n = normalizeHubURL(selected);
  if (!("url" in n)) return;
  localStorage.setItem(MODE_KEY, mode);
  localStorage.setItem(SELECTED_KEY, n.url);
  const c = loadCandidateNetworks();
  if (!c.includes(n.url)) saveCandidates([...c, n.url]);
  else notify();
}

/** Merge advertised / visited addresses into the sticky candidate list. Never changes mode or selection. */
export function rememberNetworkCandidates(urls: string[]) {
  const cur = loadCandidateNetworks();
  let changed = false;
  for (const raw of urls) {
    const n = normalizeHubURL(raw);
    if (!("url" in n) || cur.includes(n.url)) continue;
    cur.push(n.url);
    changed = true;
  }
  if (changed) saveCandidates(cur);
}

/**
 * Seed sticky selection from this page once (first visit / first hello). Later changes are only Settings › Network.
 * Also records this origin among candidates.
 */
export function seedStickyFromHere() {
  const current = here();
  if (!current) return;
  rememberNetworkCandidates([current]);
  if (!loadNetworkMode() && !loadSelectedNetwork()) {
    const kind = networkKind(current);
    setStickyNetwork(modeOfKind(kind), current);
  }
}

/** Hello-shaped fields used to list this hub's network paths. */
export interface NetworkHello {
  public_url?: unknown;
  endpoints?: unknown;
  mesh?: MeshHub[] | { hubs?: MeshHub[] };
  hub_id?: unknown;
  hub_name?: unknown;
}

function helloURLs(hello: NetworkHello | null | undefined): string[] {
  if (!hello) return [];
  const out: string[] = [];
  const add = (raw: unknown) => {
    if (typeof raw !== "string" || !raw) return;
    const n = normalizeHubURL(raw);
    if ("url" in n) out.push(n.url);
  };
  add(hello.public_url);
  const endpoints = Array.isArray(hello.endpoints) ? hello.endpoints : [];
  for (const e of endpoints) {
    if (e && typeof e === "object" && typeof (e as { url?: unknown }).url === "string") add((e as { url: string }).url);
    else if (typeof e === "string") add(e);
  }
  const mesh = Array.isArray(hello.mesh) ? hello.mesh : hello.mesh && typeof hello.mesh === "object" ? hello.mesh.hubs : undefined;
  const selfID = typeof hello.hub_id === "string" ? hello.hub_id : "";
  for (const m of Array.isArray(mesh) ? mesh : []) {
    if (!m || typeof m !== "object") continue;
    const mine = (selfID && m.hub_id === selfID) || m.self === true;
    if (!mine) continue;
    for (const e of m.endpoints ?? []) add(e);
  }
  return out;
}

/**
 * Every network path this Settings page can show for this hub: this origin, hello-advertised addresses, and
 * remembered candidates from earlier visits. Other hubs stay under Switch hub. Deduped; Home/Away filtering is the caller's.
 */
export function listNetworkPaths(hello: NetworkHello | null = lastHello): NetworkPath[] {
  const current = here();
  const byURL = new Map<string, NetworkPath>();
  const put = (url: string, source: NetworkPath["source"]) => {
    const n = normalizeHubURL(url);
    if (!("url" in n)) return;
    const had = byURL.get(n.url);
    if (had) {
      if (source === "here") had.source = "here";
      return;
    }
    byURL.set(n.url, { url: n.url, kind: networkKind(n.url), source });
  };
  if (current) put(current, "here");
  for (const u of helloURLs(hello)) put(u, "hello");
  for (const u of loadCandidateNetworks()) put(u, "hello");
  return [...byURL.values()];
}

/** Record hello-advertised paths and seed sticky once. Wired to the hub's hello below. */
export function ingestHelloNetworks(hello: NetworkHello) {
  lastHello = hello;
  const urls = helloURLs(hello);
  if (urls.length) rememberNetworkCandidates(urls);
  seedStickyFromHere();
  if (typeof hello.hub_name === "string" && hello.hub_name.trim()) rememberHub(here(), hello.hub_name.trim());
}

/** Hello fields kept for listing (tests and Settings). */
export function helloNetworks(): NetworkHello | null {
  return lastHello;
}

/** Tests reset the in-memory hello cache. */
export function resetHelloNetworks() {
  lastHello = null;
}

/**
 * Open another advertised path of this hub. Hands the device token once via `#token=` (cleared by takeToken) so the
 * other origin can sign in without a paste; sticky selection is written before navigation. Does not auto-redirect
 * on reconnect — only Settings calls this.
 */
export function goToNetwork(url: string) {
  const n = normalizeHubURL(url);
  if (!("url" in n)) return;
  if (n.url === here()) {
    setStickyNetwork(modeOfKind(networkKind(n.url)), n.url);
    return;
  }
  setStickyNetwork(modeOfKind(networkKind(n.url)), n.url);
  let target = switchURL(n.url, loadHubs());
  const token = getToken();
  if (token) {
    const u = new URL(target);
    const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
    hash.set("token", token);
    u.hash = "#" + hash.toString();
    target = u.toString();
  }
  location.href = target;
}

/** Apply a Home / Away mode: pick a matching path (prefer sticky, else first) and navigate if needed. */
export function applyNetworkMode(mode: NetworkMode, paths: NetworkPath[]) {
  const matching = paths.filter((p) => modeMatches(mode, p.kind));
  if (!matching.length) return;
  const selected = loadSelectedNetwork();
  const pick = matching.find((p) => p.url === selected) ?? matching.find((p) => p.url === here()) ?? matching[0]!;
  setStickyNetwork(mode, pick.url);
  if (pick.url !== here()) goToNetwork(pick.url);
}

/** Sub-path aware “is this the page we are on”. */
export function isCurrentNetwork(url: string): boolean {
  return url === here() || url === here() + "/" || (BASE ? url + BASE === here() : false);
}
