import { type ComponentPropsWithoutRef } from "react";
import { cn } from "cn";

// Adapted from Magic UI's Bento Grid for use with the local shadcn Cards.
export function BentoGrid({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("grid w-full grid-cols-1 gap-4 lg:grid-cols-12", className)} {...props} />
  );
}
