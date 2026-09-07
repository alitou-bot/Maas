import Image from "next/image";
import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

const sizeClasses: Record<LogoSize, string> = {
  sm: "h-7 w-auto",
  md: "h-8 w-auto",
  lg: "h-16 w-auto",
};

export function Logo({
  size = "md",
  showText = false,
  className,
}: {
  size?: LogoSize;
  showText?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/logo.png"
        alt="ZTC"
        width={120}
        height={150}
        className={cn(sizeClasses[size], "shrink-0 object-contain")}
        priority={size === "lg"}
      />
      {showText && (
        <div>
          <p className="text-sm font-bold text-text-primary leading-tight">MAAS</p>
          <p className="text-[10px] uppercase tracking-wider text-text-muted">by ZTC</p>
        </div>
      )}
    </div>
  );
}
