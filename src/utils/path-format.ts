import { isAbsolute, relative } from "node:path";
import { logStyle } from "./log-style.js";

function formatPlainPath(filePath: string): string {
  const relativePath = relative(process.cwd(), filePath);

  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return filePath;
  }

  return relativePath;
}

function formatFileResult(filePath: string, reason: string): string {
  return `${logStyle.path(relative(process.cwd(), filePath) || filePath)}: ${reason}`;
}

function formatPlainFileResult(filePath: string, reason: string): string {
  return `${formatPlainPath(filePath)}: ${reason}`;
}

function formatProgressPath(filePath: string | undefined): string | undefined {
  return filePath ? formatPlainPath(filePath) : undefined;
}

export { formatFileResult, formatPlainFileResult, formatPlainPath, formatProgressPath };
