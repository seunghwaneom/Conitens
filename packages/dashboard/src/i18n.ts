export type Locale = "ko" | "en";

export function pickText<T>(locale: Locale, copy: { ko: T; en: T }): T {
  return copy[locale];
}

const STATUS_LABELS: Record<string, { ko: string; en: string }> = {
  backlog: { ko: "백로그", en: "Backlog" },
  todo: { ko: "할 일", en: "To do" },
  in_progress: { ko: "진행 중", en: "In progress" },
  active: { ko: "활성", en: "Active" },
  blocked: { ko: "차단", en: "Blocked" },
  review: { ko: "검토", en: "Review" },
  in_review: { ko: "검토 중", en: "In review" },
  done: { ko: "완료", en: "Done" },
  cancelled: { ko: "취소", en: "Cancelled" },
  running: { ko: "실행 중", en: "Running" },
  idle: { ko: "유휴", en: "Idle" },
  assigned: { ko: "할당됨", en: "Assigned" },
  paused: { ko: "일시정지", en: "Paused" },
  dormant: { ko: "휴면", en: "Dormant" },
  retired: { ko: "퇴역", en: "Retired" },
  open: { ko: "열림", en: "Open" },
  closed: { ko: "닫힘", en: "Closed" },
  archived: { ko: "보관됨", en: "Archived" },
  approved: { ko: "승인됨", en: "Approved" },
  rejected: { ko: "거부됨", en: "Rejected" },
  pending: { ko: "대기 중", en: "Pending" },
  orchestrator: { ko: "오케스트레이터", en: "Orchestrator" },
  implementer: { ko: "구현자", en: "Implementer" },
  researcher: { ko: "리서처", en: "Researcher" },
  reviewer: { ko: "리뷰어", en: "Reviewer" },
  validator: { ko: "검증자", en: "Validator" },
  connected: { ko: "연결됨", en: "Connected" },
  connecting: { ko: "연결 중", en: "Connecting" },
  disconnected: { ko: "연결 끊김", en: "Disconnected" },
  error: { ko: "오류", en: "Error" },
  demo: { ko: "데모", en: "Demo" },
  stable: { ko: "안정", en: "Stable" },
  "attention required": { ko: "주의 필요", en: "Attention required" },
};

export function localizeStatus(locale: Locale, value: string): string {
  return STATUS_LABELS[value]?.[locale] ?? value;
}

const TASK_DETAIL_LABELS: Record<string, { ko: string; en: string }> = {
  Priority: { ko: "우선순위", en: "Priority" },
  Archived: { ko: "보관 여부", en: "Archived" },
  Run: { ko: "런", en: "Run" },
  Iteration: { ko: "이터레이션", en: "Iteration" },
  Rooms: { ko: "룸 수", en: "Rooms" },
  Workspace: { ko: "워크스페이스", en: "Workspace" },
  Iterations: { ko: "이터레이션", en: "Iterations" },
  Validator: { ko: "검증", en: "Validator" },
  Approvals: { ko: "승인", en: "Approvals" },
  Insights: { ko: "인사이트", en: "Insights" },
  Owner: { ko: "담당자", en: "Owner" },
  Acceptance: { ko: "완료 기준", en: "Acceptance" },
  Path: { ko: "경로", en: "Path" },
  Status: { ko: "상태", en: "Status" },
  "Linked context": { ko: "연결 컨텍스트", en: "Linked context" },
  "Changed fields": { ko: "변경 필드", en: "Changed fields" },
  "Approval-sensitive fields": { ko: "승인 민감 필드", en: "Approval-sensitive fields" },
  identity: { ko: "정체성", en: "identity" },
  procedural: { ko: "절차", en: "procedural" },
  episodic: { ko: "에피소드", en: "episodic" },
  reflection: { ko: "회고", en: "reflection" },
};

export function localizeLabel(locale: Locale, label: string): string {
  return TASK_DETAIL_LABELS[label]?.[locale] ?? label;
}
