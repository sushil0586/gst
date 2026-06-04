"use client";

import { useState } from "react";

export function useDashboardFilters() {
  const [workspaceId, setWorkspaceId] = useState("ws-1");
  const [clientId, setClientId] = useState("client-1");
  const [gstinId, setGstinId] = useState("gstin-1");
  const [periodId, setPeriodId] = useState("period-1");

  return {
    workspaceId,
    setWorkspaceId,
    clientId,
    setClientId,
    gstinId,
    setGstinId,
    periodId,
    setPeriodId,
  };
}
