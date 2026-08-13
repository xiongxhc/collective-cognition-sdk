import { SqliteCognitionStore } from "./sqlite.ts";

export interface SqliteCognitionWorkflowStoreOptions {
  readonly databasePath: string;
  readonly createIfMissing?: boolean;
  readonly busyTimeoutMs?: number;
}

export class SqliteCognitionWorkflowStore extends SqliteCognitionStore {
  constructor(options: SqliteCognitionWorkflowStoreOptions) {
    super(options, 2);
  }
}
