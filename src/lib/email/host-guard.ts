import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Stops users pointing SMTP/IMAP at our own private network (SSRF).
// Allows only hosts that resolve to public IP addresses.

export class BlockedHostError extends Error {}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + reserved
    );
  }
  if (version === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7)); // IPv4-mapped
    return (
      v.startsWith("fc") ||
      v.startsWith("fd") || // unique local
      v.startsWith("fe8") ||
      v.startsWith("fe9") ||
      v.startsWith("fea") ||
      v.startsWith("feb") || // link-local
      v.startsWith("ff") // multicast
    );
  }
  return true;
}

// Resolves the host once and returns a public IP to connect to. Callers must
// connect to this IP (with the host name as TLS servername), so a DNS change
// between the check and the connection can't redirect us.
export async function resolvePublicHost(host: string): Promise<string> {
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new BlockedHostError(`Server "${host}" was not found. Check the host name.`);
      });

  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new BlockedHostError(`Server "${host}" is not allowed (private network address).`);
  }
  return addresses[0].address;
}
