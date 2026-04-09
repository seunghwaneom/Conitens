import { PixelOffice } from "../components/PixelOffice.js";
import { demoAgents, demoEvents, demoTasks } from "../demo-data.js";

export function OfficeScreen() {
  return (
    <PixelOffice
      agents={demoAgents}
      tasks={demoTasks}
      events={demoEvents}
    />
  );
}
