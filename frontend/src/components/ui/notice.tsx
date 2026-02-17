import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const noticeVariants = cva("rounded-md border px-3 py-2 text-sm", {
  variants: {
    variant: {
      info: "border-border bg-muted/50 text-muted-foreground",
      success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      error: "border-destructive/50 bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: {
    variant: "info",
  },
});

type NoticeProps = React.ComponentProps<"div"> & VariantProps<typeof noticeVariants>;

function Notice({ className, variant, ...props }: NoticeProps) {
  return <div className={cn(noticeVariants({ variant }), className)} {...props} />;
}

export { Notice, noticeVariants };
