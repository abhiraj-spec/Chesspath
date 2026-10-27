import { EmptyState } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return <EmptyState className="mt-10" title="Page not found" description="This page doesn't exist. Your progress is safe." action={<ButtonLink href="/">Go to your dashboard</ButtonLink>} />;
}
