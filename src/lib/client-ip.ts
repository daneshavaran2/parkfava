/**
 * Which X-Forwarded-For entry identifies the client, given how many trusted
 * reverse proxies append to it. Pure, so it can be tested without a request.
 *
 * A client can send any X-Forwarded-For it likes; each trusted proxy then
 * appends the address it received the connection from. So the leftmost
 * entries are attacker-chosen, and the entry `hops` from the right is the
 * address the outermost trusted proxy actually saw.
 */
export function clientIpFromForwardedFor(header: string | null | undefined, hops: number): string | null {
  if (!header) return null;
  const chain = header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!chain.length) return null;
  const n = Number.isInteger(hops) && hops >= 1 ? hops : 1;
  return chain[Math.max(0, chain.length - n)]!;
}
