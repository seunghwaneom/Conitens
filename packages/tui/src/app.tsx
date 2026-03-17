import React from "react";
import { Box, Text } from "ink";
import { AgentStatusBar } from "./components/agent-status-bar.js";
import { TaskList } from "./components/task-list.js";
import { LiveLog } from "./components/live-log.js";
import { Alerts } from "./components/alerts.js";
import type { AgentStatus } from "./components/agent-status-bar.js";
import type { TaskInfo } from "./components/task-list.js";
import type { LogEntry } from "./components/live-log.js";
import type { Alert } from "./components/alerts.js";

interface AppProps {
  agents?: AgentStatus[];
  tasks?: TaskInfo[];
  logEntries?: LogEntry[];
  alerts?: Alert[];
}

export function App({
  agents = [],
  tasks = [],
  logEntries = [],
  alerts = [],
}: AppProps) {
  return (
    <Box flexDirection="column" gap={1} padding={1}>
      <Text bold color="cyan">═══ Conitens v2 Monitor ═══</Text>
      <AgentStatusBar agents={agents} />
      <Box flexDirection="row" gap={2}>
        <Box flexDirection="column" width="50%">
          <TaskList tasks={tasks} />
        </Box>
        <Box flexDirection="column" width="50%">
          <Alerts alerts={alerts} />
        </Box>
      </Box>
      <LiveLog entries={logEntries} />
    </Box>
  );
}
