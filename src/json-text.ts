import { isUnicodeScalarString } from "./types.ts";

export class JsonTextProfileError extends Error {}

function isWhitespace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\r" ||
    character === "\n"
  );
}

export function parseProfiledJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  let index = 0;
  const containers: Array<
    | { readonly kind: "array" }
    | { readonly kind: "object"; readonly keys: Set<string> }
  > = [];
  let previousToken: "open" | "comma" | "other" = "other";

  function parseStringToken(): string {
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === "\\") {
        index += 2;
      } else if (character === "\"") {
        index += 1;
        const decoded = JSON.parse(text.slice(start, index)) as string;
        if (!isUnicodeScalarString(decoded)) {
          throw new JsonTextProfileError(
            "JSON strings must contain only Unicode scalar values.",
          );
        }
        return decoded;
      } else {
        index += 1;
      }
    }
    throw new SyntaxError("Unterminated JSON string.");
  }

  while (index < text.length) {
    const character = text[index];
    if (isWhitespace(character)) {
      index += 1;
    } else if (character === "{") {
      containers.push({ kind: "object", keys: new Set<string>() });
      previousToken = "open";
      index += 1;
    } else if (character === "[") {
      containers.push({ kind: "array" });
      previousToken = "open";
      index += 1;
    } else if (character === "}" || character === "]") {
      containers.pop();
      previousToken = "other";
      index += 1;
    } else if (character === ",") {
      previousToken = "comma";
      index += 1;
    } else if (character === ":") {
      previousToken = "other";
      index += 1;
    } else if (character === "\"") {
      const decoded = parseStringToken();
      const container = containers.at(-1);
      if (
        container?.kind === "object" &&
        (previousToken === "open" || previousToken === "comma")
      ) {
        if (container.keys.has(decoded)) {
          throw new JsonTextProfileError(
            "JSON objects must not contain duplicate member names.",
          );
        }
        container.keys.add(decoded);
      }
      previousToken = "other";
    } else {
      while (
        index < text.length &&
        !isWhitespace(text[index]) &&
        text[index] !== "," &&
        text[index] !== "]" &&
        text[index] !== "}"
      ) {
        index += 1;
      }
      previousToken = "other";
    }
  }

  return value;
}
