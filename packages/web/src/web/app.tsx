import { Route, Switch } from "wouter";
import { Toaster } from "sonner";
import Index from "./pages/index";
import StrobeManualPage from "./features/tuner/StrobeManualPage";
import StrobeManualPage2 from "./features/tuner/StrobeManualPage2";
import AuthPage from "./features/tuner/AuthPage";
import MeasurePage from "./pages/measure";
import CurvePage from "./pages/curve";
import SettingsPage from "./pages/settings";
import AdminPage from "./pages/admin";
import { Provider } from "./components/provider";
import { Layout } from "./components/tuner/Layout";
import { useAuth } from "./hooks/useAuth";
import { colors, Fonts } from "./lib/theme";
import { AgentFeedback } from "@runablehq/website-runtime";

// 로그인 페이지를 메인(진입) 화면으로: 미로그인 시 어떤 경로든 로그인 화면이 먼저 뜬다.
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
          color: colors.mutedForeground,
          fontFamily: Fonts.sansMedium,
          fontSize: 14,
        }}
      >
        불러오는 중…
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return <>{children}</>;
}

function App() {
  return (
    <Provider>
      <AuthGate>
        <Layout>
          <Switch>
            <Route path="/" component={Index} />
            <Route path="/manual" component={StrobeManualPage} />
            <Route path="/strobe-manual-2" component={StrobeManualPage2} />
            <Route path="/auth" component={AuthPage} />
            <Route path="/measure" component={MeasurePage} />
            <Route path="/curve" component={CurvePage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/admin" component={AdminPage} />
          </Switch>
        </Layout>
      </AuthGate>
      <Toaster position="top-center" richColors />
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
    </Provider>
  );
}

export default App;
