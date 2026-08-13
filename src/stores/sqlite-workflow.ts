import {
  SqliteCognitionStoreBase,
  sqliteCognitionWorkflowSchemaTarget,
} from "./sqlite-internal.ts";

export interface SqliteCognitionWorkflowStoreOptions {
  readonly databasePath: string;
  readonly createIfMissing?: boolean;
  readonly busyTimeoutMs?: number;
}

export class SqliteCognitionWorkflowStore extends SqliteCognitionStoreBase {
  constructor(options: SqliteCognitionWorkflowStoreOptions) {
    super(options, sqliteCognitionWorkflowSchemaTarget);
  }
}
