import {
  evaluateAuthorization,
  validateTransitionRequest,
} from "./authorization.ts";
import type {
  AuthorizationPolicy,
  TransitionContext,
} from "./authorization.ts";
import { DomainError, DomainErrorCode } from "./errors.ts";
import { createCognitionEvent } from "./events.ts";
import type { CognitionEvent } from "./events.ts";
import { deserializeObject } from "./objects.ts";
import type {
  CognitiveObject,
  ObjectType,
  StateByType,
} from "./types.ts";

const transitions = {
  goal: { draft: ["active"], active: ["at_risk", "paused", "achieved", "abandoned", "revised"] },
  hypothesis: { proposed: ["under_review"], under_review: ["testing"], testing: ["supported", "refuted", "inconclusive"] },
  experiment: { planned: ["active", "cancelled"], active: ["completed", "cancelled"] },
  evidence: { collected: ["assessed"], assessed: ["accepted", "disputed", "rejected", "expired"] },
  decision: { draft: ["proposed"], proposed: ["approved", "rejected"], approved: ["active"], active: ["superseded"], superseded: ["archived"] },
  principle: { proposed: ["trial", "rejected"], trial: ["adopted", "rejected"], adopted: ["revised", "retired"] },
  identity: { active: ["inactive"], inactive: ["active"] },
} as const;

export interface TransitionResult<T extends ObjectType> {
  readonly object: CognitiveObject<T>;
  readonly event: CognitionEvent<T>;
}

function isValidTransition<T extends ObjectType>(
  object: CognitiveObject<T>,
  targetState: StateByType[T],
): boolean {
  const allowedTargets = (transitions[object.type] as Record<
    string,
    readonly string[]
  >)[object.state];
  return allowedTargets?.includes(targetState) ?? false;
}

export function transitionObject<T extends ObjectType>(
  object: CognitiveObject<T>,
  targetState: StateByType[T],
  context: TransitionContext,
  policy: AuthorizationPolicy = evaluateAuthorization,
): TransitionResult<T> {
  if (!isValidTransition(object, targetState)) {
    throw new DomainError(
      DomainErrorCode.INVALID_TRANSITION,
      `Cannot transition ${object.type} from ${object.state} to ${targetState}.`,
      { type: object.type, previousState: object.state, targetState },
    );
  }

  validateTransitionRequest(object, targetState, context);
  const authorization = policy(object, targetState, context);
  if (authorization.status === "confirmation_required") {
    throw new DomainError(
      DomainErrorCode.CONFIRMATION_REQUIRED,
      authorization.reason,
      { requiredActorKind: authorization.requiredActorKind },
    );
  }
  if (authorization.status === "denied") {
    throw new DomainError(DomainErrorCode.AUTHORIZATION_DENIED, authorization.reason);
  }

  const nextObject = deserializeObject(
    JSON.stringify({
      ...object,
      version: object.version + 1,
      state: targetState,
      updatedAt: context.occurredAt,
      attribution: {
        initiatorId: context.initiator.id,
        executorId: context.executor.id,
        accountableId: context.accountableParty.id,
      },
    }),
  ) as CognitiveObject<T>;
  const event = createCognitionEvent(nextObject, object.state, context);

  return Object.freeze({ object: nextObject, event });
}
