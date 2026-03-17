import React from "react";
import { Box, Text } from "ink";

export interface TaskInfo {
  taskId: string;
  state: string;
  assignee?: string;
}

interface Props {
  tasks: TaskInfo[];
}

export function TaskList({ tasks }: Props) {
  return (
    <Box flexDirection="column">
      <Text bold underline>Tasks</Text>
      {tasks.length === 0 && <Text dimColor>No active tasks</Text>}
      {tasks.map((task) => (
        <Text key={task.taskId}>
          {"  "}{task.taskId}: {task.state}
          {task.assignee ? ` (${task.assignee})` : ""}
        </Text>
      ))}
    </Box>
  );
}
