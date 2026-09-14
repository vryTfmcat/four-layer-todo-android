import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "四层待办 · 让完整任务库退到注意力之后",
  description:
    "以白板为核心，连接缓存工作台、任务存储器与外围长期对象的四层任务管理体验。",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = host
    ? new URL(`${protocol}://${host}`)
    : new URL("http://localhost:3000");

  return {
    metadataBase,
    title: "四层待办 · 让完整任务库退到注意力之后",
    description:
      "以白板为核心，连接缓存工作台、任务存储器与外围长期对象的四层任务管理体验。",
    openGraph: {
      title: "四层待办",
      description: "让完整任务库退到注意力之后",
      images: [{ url: "/og.png", width: 1536, height: 1024 }],
      locale: "zh_CN",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "四层待办",
      description: "让完整任务库退到注意力之后",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
