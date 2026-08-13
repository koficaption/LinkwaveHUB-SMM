import { cn } from "@/utils/cn";
import { Link } from "react-router-dom";

export function BrandLogo({
  className = "h-10",
  to = "/",
  withLink = true,
  variant = "light",
}: {
  className?: string;
  to?: string;
  withLink?: boolean;
  variant?: "light" | "dark";
}) {
  const image = (
    <img
      src="/logo.png"
      alt="Linkwave SMM"
      className={cn("w-auto rounded-lg object-contain object-left", className)}
    />
  );
  if (!withLink) return image;
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex min-h-11 items-center rounded-xl px-1.5 py-1",
        variant === "dark" && "bg-white/10"
      )}
    >
      {image}
    </Link>
  );
}
