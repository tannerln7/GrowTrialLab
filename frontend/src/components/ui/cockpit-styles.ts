export const cockpitStyles = {
  activityRow: "mb-2 flex items-center gap-1 text-foreground",
  comingSoonList: "m-0 grid list-none gap-1 p-0",
  kicker: "m-0 text-[0.76rem] text-muted-foreground",
  nowHeading: "flex items-center gap-1",
  photoCard: "grid gap-2",
  photoLink: "text-inherit no-underline",
  photoMeta: "grid gap-1 [&>span]:text-[0.86rem] [&>span]:text-muted-foreground",
  plantId: "m-0 text-[1.45rem] leading-tight",
  speciesText: "m-0 mt-1 text-muted-foreground",
  stickyHeader: "grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4",
  stickyHeaderCard: "sticky top-2 z-20",
  thumbnail:
    "w-full max-h-[152px] rounded-md border border-border bg-secondary object-cover md:h-[88px] md:w-[132px]",
} as const;
