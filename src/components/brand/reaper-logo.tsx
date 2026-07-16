import Image from "next/image";
import { cn } from "@/lib/cn";

export function ReaperLogo({
  className,
  title = "Reaper",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <Image
      src="/reaper_logo.svg"
      alt={title}
      width={506}
      height={626}
      priority
      className={cn("h-10 w-auto", className)}
    />
  );
}