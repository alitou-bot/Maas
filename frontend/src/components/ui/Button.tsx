import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-11 px-5 text-sm",
        variant === "primary" && "bg-accent text-accent-fg hover:brightness-110",
        variant === "secondary" &&
          "bg-surface-overlay text-text-primary hover:bg-border-strong border border-border-subtle",
        variant === "ghost" && "bg-transparent text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
        variant === "outline" &&
          "border border-border-strong bg-transparent text-text-primary hover:bg-surface-overlay",
        variant === "danger" && "bg-danger text-danger-fg hover:brightness-110",
        className
      )}
      {...props}
    />
  );
}
