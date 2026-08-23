export function shouldQueueHealthExport(input: {
  exportEnabled: boolean;
  status: string;
  sessionKind: string | null;
  externalId: string | null;
}) {
  return (
    input.exportEnabled &&
    input.status === "completed" &&
    (input.sessionKind ?? "tracked") === "tracked" &&
    !input.externalId
  );
}

export function healthExportEndMs(
  startedAt: number,
  completedAt: number | null,
) {
  const endedAt = completedAt ?? startedAt;
  return Math.max(endedAt, startedAt + 1000);
}
