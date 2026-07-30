export type MarkdownCognitionTargetTestEvent =
  | "initialize:after-target-inspection"
  | "initialize:before-manifest-commit"
  | "verify:after-target-inspection"
  | "verify:before-managed-open";

type MarkdownCognitionTargetTestHook = (
  event: MarkdownCognitionTargetTestEvent,
  relativePath?: string,
) => void;

let testHook: MarkdownCognitionTargetTestHook | undefined;

export function setMarkdownCognitionTargetTestHook(
  hook: MarkdownCognitionTargetTestHook | undefined,
): void {
  testHook = hook;
}

export function invokeMarkdownCognitionTargetTestHook(
  event: MarkdownCognitionTargetTestEvent,
  relativePath?: string,
): void {
  testHook?.(event, relativePath);
}
