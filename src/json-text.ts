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

  function skipWhitespace(): void {
    while (isWhitespace(text[index])) {
      index += 1;
    }
  }

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

  function parseObject(): void {
    index += 1;
    skipWhitespace();
    const keys = new Set<string>();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    while (index < text.length) {
      const key = parseStringToken();
      if (keys.has(key)) {
        throw new JsonTextProfileError(
          "JSON objects must not contain duplicate member names.",
        );
      }
      keys.add(key);
      skipWhitespace();
      index += 1;
      parseValue();
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      index += 1;
      skipWhitespace();
    }
  }

  function parseArray(): void {
    index += 1;
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    while (index < text.length) {
      parseValue();
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      index += 1;
      skipWhitespace();
    }
  }

  function parsePrimitive(): void {
    while (
      index < text.length &&
      !isWhitespace(text[index]) &&
      text[index] !== "," &&
      text[index] !== "]" &&
      text[index] !== "}"
    ) {
      index += 1;
    }
  }

  function parseValue(): void {
    skipWhitespace();
    if (text[index] === "{") {
      parseObject();
    } else if (text[index] === "[") {
      parseArray();
    } else if (text[index] === "\"") {
      parseStringToken();
    } else {
      parsePrimitive();
    }
  }

  parseValue();
  skipWhitespace();
  return value;
}
