import { createRoot } from "react-dom/client";
import "@pages/popup/index.css";
import Popup from "@pages/popup/Popup";
import refreshOnUpdate from "virtual:reload-on-update-in-view";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

import AsyncErrorBoundary from "@shared/component/AsyncErrorBoundary";
import { Button, Typography } from "@mui/material";

refreshOnUpdate("pages/popup");

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

const queryClient = new QueryClient();

function init() {
  const appContainer = document.querySelector("#app-container");
  if (!appContainer) {
    throw new Error("Can not find #app-container");
  }
  const root = createRoot(appContainer);
  root.render(
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <AsyncErrorBoundary
          pendingFallback={
            <div className="flex items-center justify-center h-screen">
              <div className="w-32 h-32 border-t-2 border-b-2 border-gray-500 rounded-full animate-spin" />
            </div>
          }
          errorFallback={({ error, resetErrorBoundary }) => (
            <div className="flex flex-col items-center justify-center h-screen space-y-4 text-center text-gray-200 ">
              <Typography variant="h5">문제가 발생했습니다.</Typography>
              <pre className="w-full max-w-md p-4 m-6 overflow-auto bg-gray-800 rounded-md">
                {error.message}
              </pre>
              <Button
                variant="contained"
                color="primary"
                onClick={resetErrorBoundary}
              >
                다시 시도
              </Button>
            </div>
          )}
        >
          <Popup />
        </AsyncErrorBoundary>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

init();
