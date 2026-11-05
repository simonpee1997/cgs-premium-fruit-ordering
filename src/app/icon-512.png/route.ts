import { brandIcon } from "@/lib/icon";
export const dynamic = "force-static";
export function GET() {
  return brandIcon(512);
}
