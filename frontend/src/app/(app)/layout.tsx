import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/Toast";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div id="app-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Providers>
        <ToastProvider>
          <Navbar />
          <main style={{ flex: 1 }}>{children}</main>
        </ToastProvider>
      </Providers>
    </div>
  );
}
