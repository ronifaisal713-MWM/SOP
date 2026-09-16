import "./globals.css";

export const metadata = {
  title: "MWM Agency OS",
  description:
    "Macarthur Web & Marketing Agency - Client Portal, Project & Task Management, Chat, Approvals, Billing",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
