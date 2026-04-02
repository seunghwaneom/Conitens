# Room Mapping

Status: `settled for BE-1a`

## Mapping decision

Use the forward room model only.

Canonical backend surfaces:

- `rooms` table
- `messages` table
- `tool_events` table
- `insights` table
- `handoff_packets` table
- `RoomService`
- `ReplayService`

Do not use the legacy `.notes/rooms` listing path as the primary frontend room
source for v4 work.

## Relationship shape

- one run can have zero or many rooms
- one iteration can have zero or many rooms
- one room belongs to at most one run and at most one iteration
- a room timeline can include:
  - room metadata
  - messages
  - tool events
  - insights

This is effectively:

- `run 1 -> N rooms`
- `iteration 1 -> N rooms`
- `room -> 0..1 run`
- `room -> 0..1 iteration`

## Frontend implication

The room timeline endpoint for BE-1a is:

- `GET /api/rooms/:id/timeline`

That route is safe to expose now because the forward room mapping is clear
enough for read-only replay.
