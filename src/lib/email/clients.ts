import "server-only";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { resolvePublicHost } from "./host-guard";

// One place that builds SMTP / IMAP connections, used by the connection test,
// the sending tick and the IMAP sync. TLS is always required.

export type ServerConfig = {
  host: string;
  port: number;
  secure: boolean; // true = TLS from the start; false = STARTTLS (required)
  username: string;
  password: string;
};

const CONNECT_TIMEOUT_MS = 15_000;

export async function createSmtpTransport(config: ServerConfig) {
  const ip = await resolvePublicHost(config.host);
  return nodemailer.createTransport({
    host: ip,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.username, pass: config.password },
    tls: { servername: config.host, minVersion: "TLSv1.2" },
    name: "inboxhype",
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: 30_000,
  });
}

export async function createImapClient(config: ServerConfig) {
  const ip = await resolvePublicHost(config.host);
  return new ImapFlow({
    host: ip,
    port: config.port,
    secure: config.secure,
    doSTARTTLS: config.secure ? undefined : true,
    servername: config.host,
    tls: { servername: config.host, minVersion: "TLSv1.2" },
    auth: { user: config.username, pass: config.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: 60_000,
  });
}
