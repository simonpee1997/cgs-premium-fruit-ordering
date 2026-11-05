import type { Metadata } from "next";
import OrderStatus from "./status";
export const metadata: Metadata = {
  title: "Your order · CHIPSTI ENTERPRISE",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <OrderStatus token={token} />;
}
