import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";

import { AppHome } from "./index";

function RootLayout(): React.JSX.Element {
  return (
    <>
      <Outlet />
      <Analytics />
    </>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  component: AppHome,
  getParentRoute: () => rootRoute,
  path: "/",
});

export const routeTree = rootRoute.addChildren([indexRoute]);
