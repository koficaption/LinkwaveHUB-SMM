import { cn } from "@/utils/cn";
import { Link } from "react-router-dom";

export function BrandLogo({
  className = "h-10",
  to = "/",
  withLink = true,
}: {
  className?: string;
  to?: string;
  withLink?: boolean;
}) {
  const image = (
    <img
      src="/logo.png"
      alt="Linkwave SMM"
      className={cn("w-auto object-contain object-left", className)}
    />
  );
  if (!withLink) return image;
  return (
    <Link to={to} className="inline-flex items-center rounded-xl bg-black px-2 py-1">
      {image}
    </Link>
  );
}
