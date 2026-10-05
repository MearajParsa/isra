/**
 * Step-Up Authentication Coordinator
 * Manages Step-Up OTP flow, dialog triggers, and in-flight promise deduplication.
 */

import { getStepUpToken, setStepUpToken } from './auth';

type StepUpDialogOpener = () => Promise<string>;

let dialogOpener: StepUpDialogOpener | null = null;
let currentStepUpPromise: Promise<string> | null = null;

/**
 * Registers the UI modal opener function
 */
export function registerStepUpDialogOpener(opener: StepUpDialogOpener): () => void {
  dialogOpener = opener;
  return () => {
    dialogOpener = null;
  };
}

/**
 * Requests a step-up token.
 * 1. Checks memory cache (returns if fresh).
 * 2. If a verification is already in-flight, attaches to the pending promise.
 * 3. Otherwise triggers the dialog and returns the new token upon verification.
 */
export async function ensureStepUpToken(): Promise<string> {
  const existingToken = getStepUpToken();
  if (existingToken) {
    return existingToken;
  }

  if (currentStepUpPromise) {
    return currentStepUpPromise;
  }

  if (!dialogOpener) {
    throw new Error('STEP_UP_DIALOG_UNAVAILABLE');
  }

  currentStepUpPromise = dialogOpener()
    .then((token) => {
      // Step-up tokens are valid for 5 minutes (300 sec)
      setStepUpToken(token, 300);
      return token;
    })
    .finally(() => {
      currentStepUpPromise = null;
    });

  return currentStepUpPromise;
}
