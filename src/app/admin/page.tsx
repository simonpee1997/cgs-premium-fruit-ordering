import Retail from "../retail";
export const metadata = {
  title: "Staff POS · CHIPSTI ENTERPRISE",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "CHIPSTI POS" },
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <Retail
      configured={Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      )}
    />
  );
}
