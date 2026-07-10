import { ToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "../app/app-schema";
import { LogoBoardCanvas } from "../app/logo-board-canvas";
import { InfoCard } from "../app/info-card";
import { exportBoardPng, exportBoardSvg } from "../app/export-logos";
import { ACTION } from "../app/targets";

export function AppHome(): React.JSX.Element {
  return (
    <div className="relative h-dvh min-h-dvh">
      <ToolcraftApp
        className="h-dvh min-h-dvh"
        schema={appSchema}
        canvasContent={<LogoBoardCanvas />}
        renderDefaultCanvasMedia={false}
        onPanelAction={async ({ action, state }) => {
          if (action.value === ACTION.exportPng) {
            await exportBoardPng(state);
          } else if (action.value === ACTION.exportSvg) {
            await exportBoardSvg(state);
          }
        }}
      />
      <InfoCard />
    </div>
  );
}
