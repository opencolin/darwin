// Loads .env / .modelence.env for CLI runs (the Modelence server loads them itself) and exposes typed config.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

let loaded = false;
export function loadEnv(dirs: string[] = [process.cwd()]) {
  if (loaded) return;
  loaded = true;
  for (const dir of dirs) {
    for (const f of [".env", ".modelence.env"]) {
      const p = resolve(dir, f);
      if (!existsSync(p)) continue;
      for (const [k, v] of Object.entries(parse(readFileSync(p, "utf8")))) {
        if (process.env[k] === undefined || process.env[k] === "") process.env[k] = v;
      }
    }
  }
}

/** Database named in the URI path, if any (never the credentials). */
function dbFromUri(uri: string): string | null {
  const m = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function config() {
  loadEnv();
  const e = process.env;
  let voyage = (e.VOYAGE_ENDPOINT ?? "https://api.voyageai.com/v1").replace(/\/$/, "");
  if (!/^https?:\/\//.test(voyage)) voyage = `https://${voyage}`;
  if (!/\/v1$/.test(voyage) && !/embeddings$/.test(voyage)) voyage += "/v1";
  // DARWIN_MONGODB_URI wins so a hosted deploy (which injects its own MONGODB_URI) still keeps Darwin's data on the Atlas sandbox.
  const mongoUri = e.DARWIN_MONGODB_URI ?? e.MONGODB_URI ?? "";
  return {
    llmBaseUrl: (e.LLM_BASEURL ?? "https://api.aisa.one/v1").replace(/\/$/, ""),
    llmKey: e.AISA_API_KEY ?? e.LLM_API_KEY ?? "",
    workerModel: e.DARWIN_WORKER_MODEL ?? "claude-haiku-5-5",
    metaModel: e.DARWIN_META_MODEL ?? "claude-opus-5-5",
    mongoUri,
    // Use the database the URI names (the Atlas sandbox URI names `darwin`); a platform-injected URI names its own,
    // where its user is actually authorized, so the app degrades to "empty" rather than "unauthorized".
    mongoDb: e.DARWIN_DB ?? dbFromUri(mongoUri) ?? "darwin",
    mongoSource: e.DARWIN_MONGODB_URI ? "DARWIN_MONGODB_URI" : e.MONGODB_URI ? "MONGODB_URI" : "unset",
    voyageKey: e.VOYAGE_API_KEY ?? "",
    voyageUrl: /embeddings$/.test(voyage) ? voyage : `${voyage}/embeddings`,
    voyageModel: e.VOYAGE_MODEL ?? "voyage-3.5",
    raindropKey: e.RAINDROP_WRITE_KEY ?? "",
    raindropDebug: e.RAINDROP_DEBUG === "1",
    operatorId: e.DARWIN_OPERATOR_ID ?? "operator-local",
  };
}
