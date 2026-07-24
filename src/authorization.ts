import { DomainError, DomainErrorCode } from "./errors.ts";
import type {
  ActorKind,
  CognitiveObject,
  ObjectType,
  StateByType,
} from "./types.ts";

export interface TransitionActor {
  readonly id: string;
  readonly kind: ActorKind;
}

export interface HumanConfirmation {
  readonly actor: TransitionActor & { readonly kind: "human" };
  readonly confirmedAt: string;
  readonly objectId: string;
  readonly targetState: StateByType[ObjectType];
  readonly eventId: string;
}

export type AutomationMode = "manual" | "automated";
export type ConsequenceLevel = "routine" | "consequential";

export interface TransitionContext {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly initiator: TransitionActor;
  readonly executor: TransitionActor;
  readonly accountableParty: TransitionActor;
  readonly automationMode: AutomationMode;
  readonly consequenceLevel: ConsequenceLevel;
  readonly rationale: string;
  readonly confirmation?: HumanConfirmation;
}

export type AuthorizationDecision =
  | { readonly status: "allowed" }
  | {
      readonly status: "confirmation_required";
      readonly reason: string;
      readonly requiredActorKind: "human";
    }
  | { readonly status: "denied"; readonly reason: string };

export type AuthorizationPolicy = <T extends ObjectType>(
  object: CognitiveObject<T>,
  targetState: StateByType[T],
  context: TransitionContext,
) => AuthorizationDecision;

const actorKinds = new Set<ActorKind>([
  "human",
  "agent",
  "team",
  "organization",
]);

const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

const humanConfirmationRequiredReason =
  "A human confirmation is required for this transition.";

function invalidContext(message: string, field: string): never {
  throw new DomainError(DomainErrorCode.INVALID_OBJECT, message, { field });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !isoTimestampPattern.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    return false;
  }

  const datePart = value.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  return (
    !Number.isNaN(calendarDate.getTime()) &&
    calendarDate.toISOString().slice(0, 10) === datePart
  );
}

function validateActor(value: unknown, field: string): asserts value is TransitionActor {
  if (typeof value !== "object" || value === null) {
    invalidContext(`${field} must be an actor.`, field);
  }

  const actor = value as { id?: unknown; kind?: unknown };
  if (!isNonEmptyString(actor.id)) {
    invalidContext(`${field}.id must be a non-empty string.`, `${field}.id`);
  }
  if (typeof actor.kind !== "string" || !actorKinds.has(actor.kind as ActorKind)) {
    invalidContext(`${field}.kind is invalid.`, `${field}.kind`);
  }
}

function validateConfirmation(
  value: unknown,
  eventId: string,
  occurredAt: string,
): void {
  if (typeof value !== "object" || value === null) {
    invalidContext("confirmation must be an object.", "confirmation");
  }

  const confirmation = value as {
    actor?: unknown;
    confirmedAt?: unknown;
    objectId?: unknown;
    targetState?: unknown;
    eventId?: unknown;
  };
  validateActor(confirmation.actor, "confirmation.actor");
  if (confirmation.actor.kind !== "human") {
    invalidContext(
      "confirmation.actor.kind must be human.",
      "confirmation.actor.kind",
    );
  }
  if (!isIsoTimestamp(confirmation.confirmedAt)) {
    invalidContext(
      "confirmation.confirmedAt must be an ISO timestamp.",
      "confirmation.confirmedAt",
    );
  }
  for (const field of ["objectId", "targetState", "eventId"] as const) {
    if (!isNonEmptyString(confirmation[field])) {
      invalidContext(
        `confirmation.${field} must be a non-empty string.`,
        `confirmation.${field}`,
      );
    }
  }
  if (confirmation.eventId !== eventId) {
    invalidContext(
      "confirmation.eventId must match the transition eventId.",
      "confirmation.eventId",
    );
  }
  if (Date.parse(confirmation.confirmedAt) > Date.parse(occurredAt)) {
    invalidContext(
      "confirmation.confirmedAt cannot be after occurredAt.",
      "confirmation.confirmedAt",
    );
  }
}

export function validateTransitionContext(
  context: unknown,
): asserts context is TransitionContext {
  if (typeof context !== "object" || context === null || Array.isArray(context)) {
    invalidContext("Transition context must be an object.", "context");
  }

  const value = context as Record<string, unknown>;
  if (!isNonEmptyString(value.eventId)) {
    invalidContext("eventId must be a non-empty string.", "eventId");
  }
  if (!isIsoTimestamp(value.occurredAt)) {
    invalidContext("occurredAt must be an ISO timestamp.", "occurredAt");
  }
  validateActor(value.initiator, "initiator");
  validateActor(value.executor, "executor");
  validateActor(value.accountableParty, "accountableParty");
  if (value.automationMode !== "manual" && value.automationMode !== "automated") {
    invalidContext("automationMode is invalid.", "automationMode");
  }
  if (
    value.consequenceLevel !== "routine" &&
    value.consequenceLevel !== "consequential"
  ) {
    invalidContext("consequenceLevel is invalid.", "consequenceLevel");
  }
  if (!isNonEmptyString(value.rationale)) {
    invalidContext("rationale must be a non-empty string.", "rationale");
  }
  if (value.confirmation !== undefined) {
    validateConfirmation(
      value.confirmation,
      value.eventId as string,
      value.occurredAt as string,
    );
  }
}

export function validateTransitionRequest<T extends ObjectType>(
  object: CognitiveObject<T>,
  targetState: StateByType[T],
  context: TransitionContext,
): void {
  validateTransitionContext(context);

  if (Date.parse(context.occurredAt) < Date.parse(object.updatedAt)) {
    invalidContext(
      "occurredAt cannot be before the current object version.",
      "occurredAt",
    );
  }

  const confirmation = context.confirmation;
  if (confirmation === undefined) {
    return;
  }
  if (confirmation.objectId !== object.id) {
    invalidContext(
      "confirmation.objectId must match the transitioned object.",
      "confirmation.objectId",
    );
  }
  if (confirmation.targetState !== targetState) {
    invalidContext(
      "confirmation.targetState must match the requested target state.",
      "confirmation.targetState",
    );
  }
}

function requiresHumanConfirmation<T extends ObjectType>(
  object: CognitiveObject<T>,
  targetState: StateByType[T],
  consequenceLevel: ConsequenceLevel,
): boolean {
  if (object.type === "goal") {
    return targetState === "achieved" || targetState === "abandoned";
  }
  if (object.type === "evidence") {
    return targetState === "accepted" && consequenceLevel === "consequential";
  }
  if (object.type === "decision") {
    return (
      targetState === "approved" ||
      targetState === "active" ||
      targetState === "superseded" ||
      targetState === "archived"
    );
  }
  if (object.type === "principle") {
    return (
      targetState === "adopted" ||
      targetState === "revised" ||
      targetState === "retired"
    );
  }
  return false;
}

export function evaluateAuthorization<T extends ObjectType>(
  object: CognitiveObject<T>,
  targetState: StateByType[T],
  context: TransitionContext,
): AuthorizationDecision {
  validateTransitionRequest(object, targetState, context);

  if (!requiresHumanConfirmation(object, targetState, context.consequenceLevel)) {
    return { status: "allowed" };
  }

  const confirmation = context.confirmation;
  if (confirmation === undefined || confirmation.actor.kind !== "human") {
    return {
      status: "confirmation_required",
      reason: humanConfirmationRequiredReason,
      requiredActorKind: "human",
    };
  }
  if (
    context.executor.kind === "agent" &&
    confirmation.actor.id === context.executor.id
  ) {
    return {
      status: "denied",
      reason: "An agent executor cannot confirm its own transition.",
    };
  }

  return { status: "allowed" };
}
