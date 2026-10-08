import { NotFoundError } from "@betternotez/core";
import { CircleAlert } from "lucide-react";
import { Link } from "react-router";
import { errorMessage } from "../lib/errors";
import { buttonClass } from "./button";
import { EmptyState } from "./empty-state";

export function QueryError({ error }: { readonly error: unknown }) {
  const missing = error instanceof NotFoundError;
  return (
    <EmptyState
      icon={CircleAlert}
      title={missing ? "Nothing here" : "Something went wrong"}
      action={
        <Link to="/" className={buttonClass()}>
          Back to home
        </Link>
      }
    >
      {missing ? "This item no longer exists." : errorMessage(error)}
    </EmptyState>
  );
}
