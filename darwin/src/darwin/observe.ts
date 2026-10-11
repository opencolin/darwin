// Raindrop singleton. Debug logs are on only when RAINDROP_DEBUG=1 (use it while verifying events flow).
import { Raindrop } from "raindrop-ai";
import { config } from "./config.ts";

let rd: Raindrop | null | undefined;

export function getRaindrop(): Raindrop | null {
  if (rd !== undefined) return rd;
  const c = config();
  rd = c.raindropKey ? new Raindrop({ writeKey: c.raindropKey, debugLogs: c.raindropDebug }) : null;
  return rd;
}

export async function closeRaindrop() {
  if (rd) await rd.close();
  rd = undefined;
}
