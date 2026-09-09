import clsx from "clsx";
import Image from "next/image";

export function BrandLogo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("brand-logo", compact && "compact", className)}>
      <Image
        className="brand-icon"
        src="/crm-logo.svg"
        alt="CRM Platform"
        width={58}
        height={42}
        priority
      />
      <div className="brand-text">
        <strong>CRM Platform</strong>
        {!compact ? <span>Customer relationship workspace</span> : null}
      </div>
    </div>
  );
}
