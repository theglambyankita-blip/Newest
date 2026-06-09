import { ClerkProvider, SignIn, SignUp } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AccountPage from "@/pages/account";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const clerkAppearance = {
  baseTheme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "bottom" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#c9a96e",
    colorForeground: "#2c1810",
    colorMutedForeground: "#9e7c4a",
    colorDanger: "#c0392b",
    colorBackground: "#fdf8f4",
    colorInput: "#fff9f2",
    colorInputForeground: "#2c1810",
    colorNeutral: "#c9a96e",
    fontFamily: "'Nunito', sans-serif",
    borderRadius: "6px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#fdf8f4] rounded-xl w-[440px] max-w-full overflow-hidden shadow-lg border border-[#e8c4bc]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#2c1810] font-serif",
    headerSubtitle: "text-[#9e7c4a]",
    socialButtonsBlockButtonText: "text-[#2c1810] font-semibold",
    formFieldLabel: "text-[#6b3d2e] font-semibold text-sm",
    footerActionLink: "text-[#c9a96e] hover:text-[#9e7c4a]",
    footerActionText: "text-[#9e7c4a]",
    dividerText: "text-[#9e7c4a]",
    identityPreviewEditButton: "text-[#c9a96e]",
    formFieldSuccessText: "text-green-600",
    alertText: "text-[#2c1810]",
    logoBox: "mb-1",
    logoImage: "rounded-full",
    socialButtonsBlockButton: "border border-[#e8c4bc] bg-white hover:bg-[#fdf0ee]",
    formButtonPrimary: "bg-gradient-to-r from-[#c9a96e] to-[#9e7c4a] hover:opacity-90 font-semibold",
    formFieldInput: "border-[#e8c4bc] bg-white focus:border-[#c9a96e]",
    footerAction: "bg-[#f7e9d0]",
    dividerLine: "bg-[#e8c4bc]",
    alert: "border-[#e8c4bc]",
    otpCodeFieldInput: "border-[#e8c4bc]",
    formFieldRow: "",
    main: "px-2",
  },
};

function SignInPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #fdf8f4 0%, #f7e9d0 100%)",
        padding: "24px 16px",
        flexDirection: "column",
      }}
    >
      <a
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "28px",
          textDecoration: "none",
          color: "#9e7c4a",
          fontSize: "0.85rem",
          fontFamily: "Nunito, sans-serif",
          fontWeight: 600,
        }}
      >
        ← Back to The Glam by Ankita
      </a>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={`${basePath}/account`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #fdf8f4 0%, #f7e9d0 100%)",
        padding: "24px 16px",
        flexDirection: "column",
      }}
    >
      <a
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "28px",
          textDecoration: "none",
          color: "#9e7c4a",
          fontSize: "0.85rem",
          fontFamily: "Nunito, sans-serif",
          fontWeight: 600,
        }}
      >
        ← Back to The Glam by Ankita
      </a>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={`${basePath}/account`}
      />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/account" component={AccountPage} />
      <Route>{() => null}</Route>
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  if (!clerkPubKey) {
    return null;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      localization={{
        signIn: {
          start: {
            title: "Welcome back ✦",
            subtitle: "Sign in to view your bookings",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Track your appointments with The Glam by Ankita",
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
