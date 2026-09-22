import "./globals.css";

export const metadata = {
  title: "Agency OS",
  description:
    "Client Portal, Project & Task Management, Chat, Approvals, and Billing -- one workspace per agency.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Agency OS",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1F4E79",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
