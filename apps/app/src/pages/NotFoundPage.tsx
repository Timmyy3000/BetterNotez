import { Link } from "react-router";
import { buttonClass } from "../ui/button";

export function NotFoundPage() {
  return (
    <div className="pt-6">
      <p className="label">Error 404</p>
      <h1 className="mt-4 text-[clamp(3.5rem,8vw,7rem)] leading-[0.92] tracking-[-0.02em]">Page not found</h1>
      <div aria-hidden className="double-rule my-10 max-w-2xl" />
      <p className="max-w-xl font-serif text-2xl leading-[1.3] text-muted-foreground italic">
        This page does not exist. The link may be old or mistyped.
      </p>
      <div className="mt-10">
        <Link to="/" className={buttonClass("primary")}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
