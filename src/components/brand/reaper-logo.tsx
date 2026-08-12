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
      width={550}
      height={502}
      priority
      className={cn("w-auto shrink-0", className ?? "h-10")}
    />
  );
}