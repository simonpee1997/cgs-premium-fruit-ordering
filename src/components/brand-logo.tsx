import Image from "next/image";

export default function BrandLogo({
  className = "",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/branding/chipsti-logo.webp"
      alt="CHIPSTI ENTERPRISE — koala and chip logo"
      width={108}
      height={108}
      className={`chipsti-logo ${className}`}
      preload={priority}
      loading={priority ? undefined : "eager"}
    />
  );
}
