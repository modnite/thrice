"use client";

import { useEffect, useRef, useTransition, type FormEvent } from "react";

/**
 * React 19 clears every uncontrolled field of a form after its action runs, even when the action
 * came back with a validation error, which throws away what the user typed. This hook submits
 * the form itself instead, so fields survive an error, and clears them only after a success
 * when `resetOnSuccess` is set (for "add another" style forms).
 *
 * Use: `<form {...formProps}>` with `const formProps = useNoResetForm(action, state, true)`.
 */
export function useNoResetForm(
  action: (formData: FormData) => void,
  state: { error?: string } | undefined,
  resetOnSuccess = false
) {
  const ref = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && resetOnSuccess && !state?.error) ref.current?.reset();
    wasPending.current = isPending;
  }, [isPending, state, resetOnSuccess]);

  return {
    ref,
    onSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
      const formData = new FormData(event.currentTarget, submitter);
      startTransition(() => action(formData));
    },
  };
}
