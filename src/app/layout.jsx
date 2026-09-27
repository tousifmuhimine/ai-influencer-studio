import "./globals.css";

export const metadata = {
  title: "AI Identity Studio",
  description: "Private AI influencer identity and generation studio"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
