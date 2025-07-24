// "use client";
import localFont from "next/font/local";
import "./globals.css";
// import { useEffect } from "react";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// function SocketInitializer() {
//   useEffect(() => {
//     fetch("/api/socket");
//   }, []);
//   return null;
// }

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* <SocketInitializer /> */}
        {children}
      </body>
    </html>
  );
}
