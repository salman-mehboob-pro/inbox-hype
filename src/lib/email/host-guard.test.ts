import { describe, expect, it } from "vitest";
import { isPrivateAddress } from "./host-guard";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["142.250.150.108", "8.8.8.8", "172.32.0.1", "2607:f8b0:4004:c1b::6c"])(
    "allows %s",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});
