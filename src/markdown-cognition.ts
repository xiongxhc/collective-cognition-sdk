export {
  MARKDOWN_COGNITION_MAX_INPUT_BYTES,
  MARKDOWN_COGNITION_MAX_NOTE_BYTES,
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
