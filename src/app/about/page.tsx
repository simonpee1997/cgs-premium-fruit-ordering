import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import "../shop.css";
export const metadata = {
  title: "About CHIPSTI ENTERPRISE",
  description:
    "Thoughtfully selected snacks, gifts and everyday favourites from CHIPSTI ENTERPRISE.",
};
export default function About() {
  return (
    <div className="shop shop-about-page">
      <header className="shop-header">
        <Link href="/" className="shop-brand">
          <BrandLogo priority />
          <span>
            CHIPSTI<small>ENTERPRISE</small>
          </span>
        </Link>
        <nav>
          <Link href="/#collection">Products</Link>
          <Link href="/about" aria-current="page">
            About
          </Link>
          <Link href="/#shop-help">Contact</Link>
        </nav>
      </header>
      <main className="shop-about">
        <span className="shop-eyebrow">A NOTE FROM CHIPSTI</span>
        <h1>It’s the little things that make a day.</h1>
        <p>
          A favourite snack. A thoughtful gift. Something lovely to share. We
          bring together products that make everyday moments feel a little more
          special.
        </p>
        <p>
          Browse our collection, choose store pickup or delivery, and find the
          available payment options at checkout.
        </p>
        <Link href="/#collection" className="shop-primary">
          Shop the collection
        </Link>
        <hr />
        <p>
          CHIPSTI ENTERPRISE
          <br />
          SSM: 202603232290 (RA0139100-V)
          <br />
          Malaysia · MYR
        </p>
      </main>
    </div>
  );
}
