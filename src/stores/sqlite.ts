import {
  SqliteCognitionStoreBase,
  sqliteCognitionStoreSchemaTarget,
} from "./sqlite-internal.ts";

export interface SqliteCognitionStoreOptions {
  readonly databasePath: string;
  readonly createIfMissing?: boolean;
  readonly busyTimeoutMs?: number;
}

export class SqliteCognitionStore extends SqliteCognitionStoreBase {
  constructor(options: SqliteCognitionStoreOptions) {
    super(options, sqliteCognitionStoreSchemaTarget);
  }
}
