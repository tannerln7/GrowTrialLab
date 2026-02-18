import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const noticeVariants = cva("rounded-md border px-3 py-2 text-sm", {
  variants: {
    variant: {
      default: "border-border bg-muted/50 text-foreground",
      success: "border-success/50 bg-success/15 text-success-foreground",
      warning: "border-warning/50 bg-warning/15 text-warning-foreground",
      destructive: "border-destructive/50 bg-destructive/10 text-destructive",
      // Backwards-compatible aliases.
      info: "border-border bg-muted/50 text-foreground",
      error: "border-destructive/50 bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type NoticeProps = React.ComponentProps<"div"> & VariantProps<typeof noticeVariants>;

function Notice({ className, variant, ...props }: NoticeProps) {
  return <div className={cn(noticeVariants({ variant }), className)} {...props} />;
}

export { Notice, noticeVariants };
