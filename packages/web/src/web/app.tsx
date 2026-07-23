import { Route, Switch } from "wouter";
import Index from "./pages/index";
import ManualPage from "./pages/manual";
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
          <Route path="/manual" component={ManualPage} />
          <Route path="/measure" component={MeasurePage} />
          <Route path="/curve" component={CurvePage} />
          <Route path="/settings" component={SettingsPage} />
        </Switch>
      </Layout>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
    </Provider>
  );
}

export default App;
