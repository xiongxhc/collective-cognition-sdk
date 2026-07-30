export {
  MARKDOWN_COGNITION_MAX_INPUT_BYTES,
  MARKDOWN_COGNITION_MAX_NOTE_BYTES,
  MARKDOWN_COGNITION_MAX_OBJECT_VERSION,
  MARKDOWN_COGNITION_PROFILE_VERSION,
  MarkdownCognitionError,
  markdownCognitionRelativePath,
  parseMarkdownCognitionRecord,
  renderMarkdownCognitionIndex,
  renderMarkdownCognitionRecord,
} from "./markdown-cognition-profile.ts";

export {
  MARKDOWN_COGNITION_MANIFEST_FILE,
  MARKDOWN_COGNITION_MARKER_FILE,
  MARKDOWN_COGNITION_TARGET_FORMAT,
  initializeMarkdownCognitionTarget,
  verifyMarkdownCognitionTarget,
} from "./markdown-cognition-target.ts";

export {
  MARKDOWN_COGNITION_MAX_MANIFEST_ENTRIES,
  MARKDOWN_COGNITION_MAX_PATH_SEGMENTS,
  MARKDOWN_COGNITION_MAX_RECORDS,
  MARKDOWN_COGNITION_MAX_RELATIVE_PATH_BYTES,
  MARKDOWN_COGNITION_MAX_TOTAL_BYTES,
  projectMarkdownCognition,
} from "./markdown-cognition-projection.ts";

export type {
  MarkdownCognitionErrorCode,
  MarkdownCognitionRecord,
  MarkdownCognitionRenderContext,
} from "./markdown-cognition-profile.ts";

export type {
  MarkdownCognitionTargetOptions,
  MarkdownCognitionVerificationDiagnostic,
  MarkdownCognitionVerificationReport,
} from "./markdown-cognition-target.ts";

export type {
  MarkdownCognitionProjectionOptions,
  MarkdownCognitionProjectionReport,
} from "./markdown-cognition-projection.ts";
