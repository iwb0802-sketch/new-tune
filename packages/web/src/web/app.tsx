import { Route, Switch } from "wouter";
import { Toaster } from "sonner";
import Index from "./pages/index";
import StrobeManualPage from "./features/tuner/StrobeManualPage";
import StrobeManualPage2 from "./features/tuner/StrobeManualPage2";
import AuthPage from "./features/tuner/AuthPage";
import MeasurePage from "./pages/measure";
import CurvePage from "./pages/curve";
import SettingsPage from "./pages/settings";
import { Provider } from "./components/provider";
import { Layout } from "./components/tuner/Layout";
import { AgentFeedback } from "@runablehq/website-runtime";

function App() {
  return (
    <Provider>
      <Layout>
        <Switch>
          <Route path="/" component={Index} />
          <Route path="/manual" component={StrobeManualPage} />
          <Route path="/strobe-manual-2" component={StrobeManualPage2} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/measure" component={MeasurePage} />
          <Route path="/curve" component={CurvePage} />
          <Route path="/settings" component={SettingsPage} />
        </Switch>
      </Layout>
      <Toaster position="top-center" richColors />
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
    </Provider>
  );
}

export default App;
