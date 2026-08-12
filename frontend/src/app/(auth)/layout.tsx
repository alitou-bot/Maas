import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,197,94,0.18), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(59,130,246,0.08), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border-strong) 1px, transparent 1px), linear-gradient(90deg, var(--border-strong) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative z-10 mb-8 flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-fg text-2xl font-bold shadow-lg shadow-accent/20">
          Z
        </div>
        <p className="mt-3 text-lg font-bold tracking-tight text-text-primary">ZTC</p>
        <p className="text-xs text-text-muted">MAAS Dashboard Pro</p>
      </div>
      <div className="relative z-10 w-full max-w-md">{children}</div>
      <p className="relative z-10 mt-8 text-xs text-text-muted">
        Need help?{" "}
        <Link href="mailto:support@ztc.ma" className="text-accent hover:underline cursor-pointer">
          support@ztc.ma
        </Link>
      </p>
    </div>
  );
}
