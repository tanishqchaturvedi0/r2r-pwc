import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useAuth } from "./AuthContext";

type FeaturePermissions = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canDownload: boolean;
  canInvite: boolean;
};

type PermissionsMap = Record<string, FeaturePermissions>;

type PermissionsContextType = {
  permissions: PermissionsMap;
  isLoading: boolean;
  can: (feature: string, action: string) => boolean;
  canView: (feature: string) => boolean;
};

const defaultPerms: FeaturePermissions = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canDownload: false,
  canInvite: false,
};

const PermissionsContext = createContext<PermissionsContextType | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const { data: permissions = {}, isPending } = useQuery<PermissionsMap>({
    queryKey: ["/api/permissions/me"],
    queryFn: () => apiGet<PermissionsMap>("/api/permissions/me"),
    enabled: !!user,
    staleTime: 30000,
  });

  // Use isPending gated on user to avoid the race condition where
  // isLoading briefly becomes false before the fetch starts (when the
  // query transitions from disabled to enabled on page refresh).
  const isLoading = !!user && isPending;

  const can = (feature: string, action: string): boolean => {
    const featurePerms = permissions[feature];
    if (!featurePerms) return false;
    return !!(featurePerms as any)[action];
  };

  const canViewFn = (feature: string): boolean => {
    return can(feature, "canView");
  };

  return (
    <PermissionsContext.Provider value={{ permissions, isLoading, can, canView: canViewFn }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider");
  return ctx;
}
