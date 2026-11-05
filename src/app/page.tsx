import type { Metadata } from "next";
import Shop from "./shop";
export const metadata: Metadata = {
  title: "CHIPSTI ENTERPRISE · A little more extraordinary",
  description:
    "Discover the CHIPSTI collection. Shop snacks and gifts online with pickup and delivery in Malaysia.",
};
export default function Page() {
  return <Shop />;
}
