import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "@/src/lib/api";
import { normalizeUserFacingError } from "@/src/lib/error-normalization";

export function useHomeController() {
  const [result, setResult] = useState<string>("");
  const [meResult, setMeResult] = useState<string>("No profile loaded.");
  const [notInvited, setNotInvited] = useState(false);
  const [offline, setOffline] = useState(false);

  const healthMutation = useMutation({
    mutationFn: () => api.get<Record<string, unknown>>("/healthz"),
    onMutate: () => {
      setResult("");
      setOffline(false);
    },
    onSuccess: (data) => {
      setResult(JSON.stringify(data, null, 2));
      setOffline(false);
    },
    onError: () => {
      setOffline(true);
      setResult("Unable to reach backend.");
    },
  });

  const meMutation = useMutation({
    mutationFn: () => api.get<{ email: string; role: string; status: string }>("/api/me"),
    onSuccess: (data) => {
      setMeResult(`${data.email} (${data.role}, ${data.status})`);
      setNotInvited(false);
      setOffline(false);
    },
    onError: (mutationError) => {
      const normalized = normalizeUserFacingError(mutationError, "Unable to load profile.");
      if (normalized.kind === "forbidden") {
        setNotInvited(true);
        setMeResult("Not invited.");
        return;
      }
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setMeResult("Unable to load profile.");
    },
  });

  return {
    ui: {
      result,
      meResult,
      notInvited,
      offline,
    },
    actions: {
      runHealthCheck: () => healthMutation.mutate(),
      loadMyProfile: () => meMutation.mutate(),
    },
    mutations: {
      healthMutation,
      meMutation,
    },
  };
}
