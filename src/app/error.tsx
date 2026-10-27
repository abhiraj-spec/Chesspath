"use client";

import { ErrorState } from "@/components/ui/primitives";
import { Button, ButtonLink } from "@/components/ui/Button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <ErrorState
        title="Something went wrong on this page"
        description={`Your saved progress is not affected. (${error.message.slice(0, 160)})`}
        action={
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <ButtonLink href="/" variant="secondary">
              Dashboard
            </ButtonLink>
          </div>
        }
      />
    </div>
  );
}
