import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "CHIPSTI · Retail atelier",
  description: "CHIPSTI ENTERPRISE retail operations",
  metadataBase: new URL("https://chipsti.com"),
  icons: {
    icon: [{ url: "/favicon.ico?v=koala-1", sizes: "32x32" }],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    siteName: "CHIPSTI ENTERPRISE",
    images: [
      {
        url: "/branding/chipsti-social.jpg",
        width: 1200,
        height: 630,
        alt: "CHIPSTI official koala and chip logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/branding/chipsti-social.jpg"],
  },
};
export const viewport: Viewport = {
  themeColor: "#332b24",
  width: "device-width",
  initialScale: 1,
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
