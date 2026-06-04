"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { clients as mockClients } from "@/data/clients";
import { compliancePeriods as mockPeriods } from "@/data/compliancePeriods";
import { gstins as mockGstins } from "@/data/gstins";
import { useWorkspaceContextDataQuery } from "@/features/workspace";
import { useSession } from "@/lib/query/session-provider";
import type {
  ClientRecord,
  CompliancePeriodRecord,
  GSTINRecordApi,
  SessionPayload,
  WorkspaceAccessRecord,
} from "@/types/api";

const STORAGE_KEYS = {
  workspaceId: "gst:selected-workspace-id",
  clientId: "gst:selected-client-id",
  gstinId: "gst:selected-gstin-id",
  periodId: "gst:selected-period-id",
};

function readStorage(key: string) {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(key);
}

function writeStorage(key: string, value: string | null) {
  if (typeof window === "undefined") {
    return;
  }
  if (value) {
    window.localStorage.setItem(key, value);
  } else {
    window.localStorage.removeItem(key);
  }
}

type WorkspaceContextValue = {
  workspaces: WorkspaceAccessRecord[];
  clients: ClientRecord[];
  gstins: GSTINRecordApi[];
  periods: CompliancePeriodRecord[];
  selectedWorkspaceId?: string;
  selectedClientId?: string;
  selectedGstinId?: string;
  selectedPeriodId?: string;
  selectedWorkspace?: WorkspaceAccessRecord | null;
  selectedClient?: ClientRecord | null;
  selectedGstin?: GSTINRecordApi | null;
  selectedPeriod?: CompliancePeriodRecord | null;
  setSelectedWorkspaceId: (id: string) => void;
  setSelectedClientId: (id: string) => void;
  setSelectedGstinId: (id: string) => void;
  setSelectedPeriodId: (id: string) => void;
  hasWorkspace: boolean;
  hasClient: boolean;
  hasGstin: boolean;
  hasPeriod: boolean;
  requiresOnboarding: boolean;
  isLoading: boolean;
  session: SessionPayload | null;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

function toFallbackClients(workspaceId?: string): ClientRecord[] {
  return mockClients
    .filter((client) => !workspaceId || client.workspaceId === workspaceId)
    .map((client) => ({
      id: client.id,
      workspace: client.workspaceId,
      legal_name: client.name,
      trade_name: client.name,
      client_code: client.code,
      pan: "ABCDE1234F",
      email: "",
      is_active: true,
    }));
}

function toFallbackGstins(clientId?: string): GSTINRecordApi[] {
  return mockGstins
    .filter((gstin) => !clientId || gstin.clientId === clientId)
    .map((gstin) => ({
      id: gstin.id,
      client: gstin.clientId,
      gstin: gstin.gstin,
      registration_type: gstin.registrationType,
      state_code: gstin.state,
      is_active: true,
    }));
}

function toFallbackPeriods(gstinId?: string): CompliancePeriodRecord[] {
  return mockPeriods
    .filter((period) => !gstinId || period.gstinId === gstinId)
    .map((period) => ({
      id: period.id,
      gstin: period.gstinId,
      period: period.label,
      return_type: "GSTR-3B",
      status: period.status,
      due_date: period.dueDate,
      is_locked: false,
      locked_at: null,
      locked_by: null,
      locked_by_name: null,
      is_active: true,
    }));
}

export function WorkspaceContextProvider({ children }: { children: React.ReactNode }) {
  const { session, isLoading: sessionLoading } = useSession();
  const workspaceList = useMemo(() => session?.workspaces ?? [], [session?.workspaces]);

  const [selectedWorkspaceId, setSelectedWorkspaceIdState] = useState<string | undefined>(() => readStorage(STORAGE_KEYS.workspaceId) ?? undefined);
  const [selectedClientId, setSelectedClientIdState] = useState<string | undefined>(() => readStorage(STORAGE_KEYS.clientId) ?? undefined);
  const [selectedGstinId, setSelectedGstinIdState] = useState<string | undefined>(() => readStorage(STORAGE_KEYS.gstinId) ?? undefined);
  const [selectedPeriodId, setSelectedPeriodIdState] = useState<string | undefined>(() => readStorage(STORAGE_KEYS.periodId) ?? undefined);

  const selectedWorkspace =
    workspaceList.find((workspace) => workspace.id === selectedWorkspaceId)
    ?? workspaceList.find((workspace) => workspace.id === session?.default_workspace?.id)
    ?? workspaceList[0]
    ?? null;
  const effectiveWorkspaceId = selectedWorkspace?.id;
  const contextDataQuery = useWorkspaceContextDataQuery(effectiveWorkspaceId);
  const liveClients = contextDataQuery.data?.clients ?? [];
  const clients = contextDataQuery.isError ? toFallbackClients(effectiveWorkspaceId) : liveClients;
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0] ?? null;
  const effectiveClientId = selectedClient?.id;
  const liveGstins = useMemo(
    () => (contextDataQuery.data?.gstins ?? []).filter((gstin) => !effectiveClientId || gstin.client === effectiveClientId),
    [contextDataQuery.data?.gstins, effectiveClientId],
  );
  const gstins = contextDataQuery.isError ? toFallbackGstins(effectiveClientId) : liveGstins;
  const selectedGstin = gstins.find((gstin) => gstin.id === selectedGstinId) ?? gstins[0] ?? null;
  const effectiveGstinId = selectedGstin?.id;
  const livePeriods = useMemo(
    () => (contextDataQuery.data?.periods ?? []).filter((period) => !effectiveGstinId || period.gstin === effectiveGstinId),
    [contextDataQuery.data?.periods, effectiveGstinId],
  );
  const periods = contextDataQuery.isError ? toFallbackPeriods(effectiveGstinId) : livePeriods;
  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) ?? periods[0] ?? null;

  useEffect(() => {
    writeStorage(STORAGE_KEYS.workspaceId, selectedWorkspace?.id ?? null);
  }, [selectedWorkspace?.id]);
  useEffect(() => {
    writeStorage(STORAGE_KEYS.clientId, selectedClient?.id ?? null);
  }, [selectedClient?.id]);
  useEffect(() => {
    writeStorage(STORAGE_KEYS.gstinId, selectedGstin?.id ?? null);
  }, [selectedGstin?.id]);
  useEffect(() => {
    writeStorage(STORAGE_KEYS.periodId, selectedPeriod?.id ?? null);
  }, [selectedPeriod?.id]);

  const setSelectedWorkspaceId = useCallback((id: string) => {
    setSelectedWorkspaceIdState(id);
    setSelectedClientIdState(undefined);
    setSelectedGstinIdState(undefined);
    setSelectedPeriodIdState(undefined);
  }, []);

  const setSelectedClientId = useCallback((id: string) => {
    setSelectedClientIdState(id);
    setSelectedGstinIdState(undefined);
    setSelectedPeriodIdState(undefined);
  }, []);

  const setSelectedGstinId = useCallback((id: string) => {
    setSelectedGstinIdState(id);
    setSelectedPeriodIdState(undefined);
  }, []);

  const setSelectedPeriodId = useCallback((id: string) => {
    setSelectedPeriodIdState(id);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces: workspaceList,
      clients,
      gstins,
      periods,
      selectedWorkspaceId: selectedWorkspace?.id,
      selectedClientId: selectedClient?.id,
      selectedGstinId: selectedGstin?.id,
      selectedPeriodId: selectedPeriod?.id,
      selectedWorkspace,
      selectedClient,
      selectedGstin,
      selectedPeriod,
      setSelectedWorkspaceId,
      setSelectedClientId,
      setSelectedGstinId,
      setSelectedPeriodId,
      hasWorkspace: workspaceList.length > 0,
      hasClient: clients.length > 0,
      hasGstin: gstins.length > 0,
      hasPeriod: periods.length > 0,
      requiresOnboarding: workspaceList.length === 0 || clients.length === 0,
      isLoading: sessionLoading || contextDataQuery.isLoading,
      session: session ?? null,
    }),
    [
      clients,
      contextDataQuery.isLoading,
      gstins,
      periods,
      selectedClient,
      selectedGstin,
      selectedPeriod,
      selectedWorkspace,
      session,
      sessionLoading,
      workspaceList,
      setSelectedWorkspaceId,
      setSelectedClientId,
      setSelectedGstinId,
      setSelectedPeriodId,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceContext must be used within WorkspaceContextProvider.");
  }
  return context;
}
