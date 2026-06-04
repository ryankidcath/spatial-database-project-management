"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type Props = {
  children: React.ReactNode;
  pendingLabel: string;
};

export function AuthSubmitButton({ children, pendingLabel }: Props) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      className="h-11 w-full gap-2 text-base"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <Spinner className="size-4 shrink-0" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function AuthFormPendingFieldset({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <fieldset disabled={pending} className="mt-6 min-w-0 space-y-5 border-0 p-0 m-0">
      {children}
    </fieldset>
  );
}
