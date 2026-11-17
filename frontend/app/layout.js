import "./globals.css";

export const metadata = {
  title: "Pakistan House Price Predictor",
  description:
    "Estimate house sale prices in Pakistani cities with a machine learning model trained on Zameen.com listings.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}