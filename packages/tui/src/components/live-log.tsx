import React from "react";
import { Box, Text } from "ink";

export interface LogEntry {
  eventId: string;
  type: string;
  ts: string;
  actor: string;
}

interface Props {
  entries: LogEntry[];
  maxLines?: number;
}

export function LiveLog({ entries, maxLines = 10 }: Props) {
  const visible = entries.slice(-maxLines);
  return (
    <Box flexDirection="column">
      <Text bold underline>Live Log</Text>
      {visible.length === 0 && <Text dimColor>No events yet</Text>}
      {visible.map((entry) => (
        <Text key={entry.eventId} dimColor>
          [{entry.ts.slice(11, 19)}] {entry.type} by {entry.actor}
        </Text>
      ))}
    </Box>
  );
}
