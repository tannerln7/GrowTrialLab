import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { api } from "@/src/lib/api";
import { normalizeUserFacingError } from "@/src/lib/errors/normalizeError";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";

export function useNewExperimentController() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);

  const meQuery = useQuery({
    queryKey: queryKeys.system.me(),
    queryFn: () => api.get<{ email: string; role: string; status: string }>("/api/me"),
    staleTime: 60_000,
  });

  const meState = usePageQueryState(meQuery);
  const notInvited = meState.errorKind === "forbidden";

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post<{ id: string }>("/api/v1/experiments/", {
        name: name.trim(),
        description: description.trim(),
      }),
    onMutate: () => {
      setError("");
      setOffline(false);
    },
    onSuccess: (data) => {
      router.push(`/experiments/${data.id}`);
    },
    onError: (mutationError) => {
      const normalized = normalizeUserFacingError(mutationError, "Unable to create experiment.");
      if (normalized.kind === "offline") {
        setOffline(true);
      }
      setError("Unable to create experiment.");
    },
  });

  const queryError = useMemo(() => {
    if (notInvited) {
      return "";
    }
    if (meState.isError) {
      if (meState.errorKind === "offline") {
        return "";
      }
      return "Unable to confirm access.";
    }
    return "";
  }, [meState.errorKind, meState.isError, notInvited]);

  const queryOffline = meState.errorKind === "offline";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createMutation.mutateAsync();
  }

  return {
    ui: {
      error,
      offline,
      queryError,
      queryOffline,
      notInvited,
      isLoadingMe: meState.isLoading,
    },
    form: {
      name,
      description,
      setName,
      setDescription,
    },
    actions: {
      onSubmit,
    },
    mutations: {
      createMutation,
    },
  };
}
