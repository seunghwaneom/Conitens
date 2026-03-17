import React from "react";
import { Box, Text } from "ink";

export interface Alert {
  id: string;
  level: "info" | "warning" | "error";
  message: string;
  ts: string;
}

interface Props {
  alerts: Alert[];
}

export function Alerts({ alerts }: Props) {
  return (
    <Box flexDirection="column">
      <Text bold underline>Alerts</Text>
      {alerts.length === 0 && <Text dimColor>No alerts</Text>}
      {alerts.map((alert) => {
        const color = alert.level === "error" ? "red" :
                      alert.level === "warning" ? "yellow" : "blue";
        return (
          <Text key={alert.id} color={color}>
            [{alert.level.toUpperCase()}] {alert.message}
          </Text>
        );
      })}
    </Box>
  );
}
