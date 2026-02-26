import { appendFile, mkdir } from "fs/promises";
import { join } from "path";

const LOG_DIR = join(import.meta.dir || process.cwd(), "..", "logs");

async function ensureLogDir() {
  await mkdir(LOG_DIR, { recursive: true });
}

export async function log(
  level: "info" | "error" | "warn",
  message: string,
  data?: any
): Promise<void> {
  await ensureLogDir();
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? " | " + JSON.stringify(data) : ""}\n`;
  await appendFile(join(LOG_DIR, "server.log"), line);
  if (level === "error") {
    console.error(line.trim());
  }
}
