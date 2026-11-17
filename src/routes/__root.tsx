import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { CompassIcon, ClockCounterClockwiseIcon, KeyIcon, PlusIcon } from "@phosphor-icons/react";

import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // Replace these placeholders with the app's name and description when first building the app.
    // Each content route, / included, must still set its own head(). Never add og:image or
    // twitter:image here: every page without its own would inherit the root's preview image.
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TinyCompass | Where should I set up?" },
      { name: "description", content: "Compare licences, filings, costs and approval times across places, sourced from official government sites." },
      { property: "og:title", content: "TinyCompass" },
      { property: "og:description", content: "Side-by-side licensing comparison from official government sources." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#005a5b" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@500;700;800&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeTab = pathname === "/history" ? "history" : pathname === "/settings" ? "settings" : "comparison";

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <header className="floating-header no-print">
        <nav aria-label="Main navigation" className="floating-nav">
          <Link to="/" className="compass-brand flex shrink-0 items-center gap-2 font-display text-xl font-bold text-primary">
            <CompassIcon className="compass-mark text-brass" size={32} weight="duotone" aria-hidden="true" /> TinyCompass
          </Link>
          <div className="nav-tabs" data-active={activeTab}>
            <span className="nav-tab-indicator" aria-hidden="true" />
            <Link to="/" className="nav-tab" activeOptions={{ exact: true }} aria-current={activeTab === "comparison" ? "page" : undefined}>
              <PlusIcon size={17} aria-hidden="true" /><span>New comparison</span>
            </Link>
            <Link to="/history" className="nav-tab" aria-current={activeTab === "history" ? "page" : undefined}>
              <ClockCounterClockwiseIcon size={17} aria-hidden="true" /><span>History</span>
            </Link>
            <Link to="/settings" className="nav-tab" aria-current={activeTab === "settings" ? "page" : undefined}>
              <KeyIcon size={17} aria-hidden="true" /><span>API keys</span>
            </Link>
          </div>
        </nav>
      </header>
      <div key={pathname} className="page-transition"><Outlet /></div>
      <Toaster />
    </QueryClientProvider>
  );
}
