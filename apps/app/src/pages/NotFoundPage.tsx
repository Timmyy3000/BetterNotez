import { CircleAlert } from "lucide-react";
import { Link } from "react-router";
import { buttonClass } from "../ui/button";
import { EmptyState } from "../ui/empty-state";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={CircleAlert}
      title="Page not found"
      action={
        <Link to="/" className={buttonClass()}>
          Back to home
        </Link>
      }
    >
      This page does not exist. The link may be old or mistyped.
    </EmptyState>
  );
}
