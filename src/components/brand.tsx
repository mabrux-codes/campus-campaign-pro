import { Sparkle } from "lucide-react";

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Sparkle className="h-[60%] w-[60%]" strokeWidth={2.2} />
    </span>
  );
}

export function BrandLockup({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <BrandMark size={size} />
      <span className="font-display text-2xl leading-none">Lumen</span>
    </div>
  );
}
