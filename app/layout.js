import "./globals.css";

export const metadata = {
  title: "Agency OS",
  description:
    "Client Portal, Project & Task Management, Chat, Approvals, and Billing -- one workspace per agency.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
