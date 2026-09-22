export default function manifest() {
  return {
    name: "Agency OS",
    short_name: "Agency OS",
    description:
      "Client Portal, Project & Task Management, Chat, Approvals, and Billing -- one workspace per agency.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1F4E79",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
