import Retail from "./retail";
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
