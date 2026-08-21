export interface GitProcessResultLike {
  readonly error?: unknown;
  readonly signal: string | null;
  readonly status: number | null;
  readonly stdout: unknown;
}

export type GitProcessResultClassification =
  | { readonly kind: "target_unavailable" }
  | { readonly kind: "read_failed" }
  | { readonly kind: "command_failed" }
  | { readonly kind: "success"; readonly stdout: Buffer };

export function classifyGitProcessResult(
  result: GitProcessResultLike,
): GitProcessResultClassification {
  if (processErrorCode(result.error) === "ENOENT") {
    return { kind: "target_unavailable" };
  }
  if (result.error !== undefined || result.signal !== null) {
    return { kind: "read_failed" };
  }
  if (result.status !== 0) {
    return { kind: "command_failed" };
  }
  if (!Buffer.isBuffer(result.stdout)) {
    return { kind: "read_failed" };
  }
  return { kind: "success", stdout: result.stdout };
}

function processErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

export function validGitObjectByteLength(
  value: string,
  maximumBytes: number,
): boolean {
  if (!/^[0-9]+$/.test(value)) {
    return false;
  }
  const byteLength = Number(value);
  return Number.isSafeInteger(byteLength) &&
    Number.isSafeInteger(maximumBytes) &&
    maximumBytes >= 0 &&
    byteLength <= maximumBytes;
}
