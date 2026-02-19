"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { unwrapList } from "@/lib/backend";
import { cn } from "@/lib/utils";
import type { ExperimentStatusSummary } from "@/lib/experiment-status";
import { Badge } from "@/src/components/ui/badge";
import { buttonVariants } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { NativeSelect } from "@/src/components/ui/native-select";
import PageAlerts from "@/src/components/ui/PageAlerts";
import PageShell from "@/src/components/ui/PageShell";
import SectionCard from "@/src/components/ui/SectionCard";
import { experimentsStyles as styles } from "@/src/components/ui/experiments-styles";
import { Textarea } from "@/src/components/ui/textarea";
import { api, isApiError } from "@/src/lib/api";
import { normalizeUserFacingError } from "@/src/lib/errors/normalizeError";
import { queryKeys } from "@/src/lib/queryKeys";
import { usePageQueryState } from "@/src/lib/usePageQueryState";


type Timeframe = "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT";
type RuleType = "DAILY" | "WEEKLY" | "CUSTOM_DAYS_INTERVAL";
type ScopeType = "TENT" | "TRAY" | "PLANT";
type ActionType = "FEED" | "ROTATE" | "PHOTO" | "METRICS" | "NOTE" | "CUSTOM";

type ScheduleRule = {
  id: string;
  rule_type: RuleType;
  interval_days: number | null;
  weekdays: string[];
  timeframe: Timeframe;
  exact_time: string | null;
  start_date: string | null;
  end_date: string | null;
};

type ScheduleScope = {
  id: string;
  scope_type: ScopeType;
  scope_id: string;
  label: string;
};

type ScheduleAction = {
  id: string;
  title: string;
  action_type: ActionType;
  description: string;
  enabled: boolean;
  rules: ScheduleRule[];
  scopes: ScheduleScope[];
  current_blockers: string[];
};

type ScheduleSlotAction = {
  schedule_id: string;
  title: string;
  action_type: ActionType;
  description: string;
  scope_summary: string;
  scope_labels: string[];
  blocked_reasons: string[];
};

type SchedulePlan = {
  days: number;
  start_date: string;
  end_date: string;
  due_counts_today: number;
  slots: {
    count: number;
    results: Array<{
      date: string;
      timeframe: Timeframe | null;
      exact_time: string | null;
      slot_label: string;
      actions: ScheduleSlotAction[];
    }>;
    meta: Record<string, unknown>;
  };
};

type PlacementSummary = {
  tents: {
    count: number;
    results: Array<{
      tent_id: string;
      name: string;
      code: string;
      allowed_species_count: number;
      allowed_species: Array<{ id: string; name: string; category: string }>;
    }>;
    meta: Record<string, unknown>;
  };
  trays: {
    count: number;
    results: Array<{
      tray_id: string;
      name: string;
      current_count: number;
      capacity: number;
      location: {
        status: "placed" | "unplaced";
        tent: { id: string; code: string | null; name: string } | null;
        slot: { id: string; code: string; label: string } | null;
        tray: { id: string; code: string; name: string; capacity: number; current_count: number } | null;
      };
      plants: Array<{
        uuid: string;
        species_id: string;
        species_name: string;
        species_category: string;
      }>;
    }>;
    meta: Record<string, unknown>;
  };
};

type OverviewPlant = {
  uuid: string;
  plant_id: string;
  species_name: string;
  species_category: string;
  status: string;
  assigned_recipe: { id: string; code: string; name: string } | null;
  location: {
    status: "placed" | "unplaced";
    tent: { id: string; code: string | null; name: string } | null;
    slot: { id: string; code: string; label: string } | null;
    tray: { id: string; code: string; name: string } | null;
  };
};

const ACTION_TYPE_OPTIONS: Array<{ value: ActionType; label: string }> = [
  { value: "FEED", label: "Feed" },
  { value: "ROTATE", label: "Rotate" },
  { value: "PHOTO", label: "Photo" },
  { value: "METRICS", label: "Weekly Metrics" },
  { value: "NOTE", label: "Note" },
  { value: "CUSTOM", label: "Custom" },
];

const TIMEFRAME_OPTIONS: Array<{ value: Timeframe; label: string }> = [
  { value: "MORNING", label: "Morning" },
  { value: "AFTERNOON", label: "Afternoon" },
  { value: "EVENING", label: "Evening" },
  { value: "NIGHT", label: "Night" },
];

const WEEKDAY_OPTIONS = [
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
  { value: "SAT", label: "Sat" },
  { value: "SUN", label: "Sun" },
];

type WeeklyRuleEditor = {
  weekday: string;
  timeframe: Timeframe;
  exact_time: string;
};

function formatSlotTitle(dateValue: string, timeframe: string | null, exactTime: string | null): string {
  const parsed = new Date(`${dateValue}T00:00:00`);
  const day = Number.isNaN(parsed.getTime())
    ? dateValue
    : parsed.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  if (exactTime) {
    return `${day} — ${exactTime.slice(0, 5)}`;
  }
  if (timeframe) {
    return `${day} — ${timeframe[0]}${timeframe.slice(1).toLowerCase()}`;
  }
  return day;
}

function summarizeRule(rule: ScheduleRule): string {
  if (rule.rule_type === "WEEKLY") {
    const weekday = rule.weekdays[0] ?? "Day";
    return `${weekday} ${rule.exact_time ? rule.exact_time.slice(0, 5) : rule.timeframe.toLowerCase()}`;
  }
  if (rule.rule_type === "CUSTOM_DAYS_INTERVAL") {
    return `Every ${rule.interval_days ?? "?"} days ${rule.exact_time ? rule.exact_time.slice(0, 5) : rule.timeframe.toLowerCase()}`;
  }
  return `Daily ${rule.exact_time ? rule.exact_time.slice(0, 5) : rule.timeframe.toLowerCase()}`;
}

function actionTypeLabel(actionType: ActionType): string {
  return ACTION_TYPE_OPTIONS.find((item) => item.value === actionType)?.label ?? actionType;
}

function compactAllowedSpeciesLabel(tent: PlacementSummary["tents"]["results"][number]): string {
  if (tent.allowed_species_count === 0) {
    return "Any species";
  }
  if (tent.allowed_species.length === 0) {
    return `${tent.allowed_species_count} allowed species`;
  }
  const topNames = tent.allowed_species.slice(0, 2).map((species) => species.name);
  if (tent.allowed_species.length > 2) {
    return `${topNames.join(", ")} +${tent.allowed_species.length - 2}`;
  }
  return topNames.join(", ");
}

function trayRestrictionHint(
  tray: PlacementSummary["trays"]["results"][number],
  tentById: Map<string, PlacementSummary["tents"]["results"][number]>,
): string {
  if (!tray.location.tent?.id) {
    return "";
  }
  const trayTent = tentById.get(tray.location.tent.id);
  if (!trayTent || trayTent.allowed_species_count === 0) {
    return "";
  }
  return compactAllowedSpeciesLabel(trayTent);
}

type ExperimentSchedulePageClientProps = {
  experimentId: string;
};

export function ExperimentSchedulePageClient({ experimentId }: ExperimentSchedulePageClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const plantFilter = searchParams.get("plant");

  const [mutationOffline, setMutationOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<ExperimentStatusSummary | null>(null);
  const [daysWindow, setDaysWindow] = useState<7 | 14>(7);
  const [plan, setPlan] = useState<SchedulePlan | null>(null);
  const [actions, setActions] = useState<ScheduleAction[]>([]);
  const [placementSummary, setPlacementSummary] = useState<PlacementSummary | null>(null);
  const [overviewPlants, setOverviewPlants] = useState<OverviewPlant[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<ActionType>("FEED");
  const [title, setTitle] = useState("");
  const [titleDirty, setTitleDirty] = useState(false);
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [recurrenceMode, setRecurrenceMode] = useState<"weekly" | "interval" | "daily">("weekly");
  const [weeklyRules, setWeeklyRules] = useState<WeeklyRuleEditor[]>([
    { weekday: "MON", timeframe: "AFTERNOON", exact_time: "" },
  ]);
  const [intervalDays, setIntervalDays] = useState(7);
  const [intervalTimeframe, setIntervalTimeframe] = useState<Timeframe>("AFTERNOON");
  const [intervalExactTime, setIntervalExactTime] = useState("");
  const [dailyTimeframe, setDailyTimeframe] = useState<Timeframe>("MORNING");
  const [dailyExactTime, setDailyExactTime] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("TENT");
  const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);

  const tentById = useMemo(() => {
    const map = new Map<string, PlacementSummary["tents"]["results"][number]>();
    for (const tent of placementSummary ? unwrapList<PlacementSummary["tents"]["results"][number]>(placementSummary.tents) : []) {
      map.set(tent.tent_id, tent);
    }
    return map;
  }, [placementSummary]);

  const trayById = useMemo(() => {
    const map = new Map<string, PlacementSummary["trays"]["results"][number]>();
    for (const tray of placementSummary ? unwrapList<PlacementSummary["trays"]["results"][number]>(placementSummary.trays) : []) {
      map.set(tray.tray_id, tray);
    }
    return map;
  }, [placementSummary]);

  const activePlants = useMemo(
    () => overviewPlants.filter((plant) => plant.status === "active"),
    [overviewPlants],
  );

  const recurrenceLabel = useMemo(() => {
    if (recurrenceMode === "weekly") {
      const firstRule = weeklyRules[0];
      if (!firstRule) {
        return "Weekly";
      }
      const weekday = WEEKDAY_OPTIONS.find((item) => item.value === firstRule.weekday)?.label ?? firstRule.weekday;
      const timeLabel = firstRule.exact_time || firstRule.timeframe.toLowerCase();
      return `${weekday} ${timeLabel}`;
    }
    if (recurrenceMode === "interval") {
      return `Every ${intervalDays} days ${intervalExactTime || intervalTimeframe.toLowerCase()}`;
    }
    return `Daily ${dailyExactTime || dailyTimeframe.toLowerCase()}`;
  }, [dailyExactTime, dailyTimeframe, intervalDays, intervalExactTime, intervalTimeframe, recurrenceMode, weeklyRules]);

  const scopeSuggestionLabel = useMemo(() => {
    const firstScope = selectedScopeIds[0];
    if (!firstScope) {
      return "Experiment";
    }
    if (scopeType === "TENT") {
      const tent = tentById.get(firstScope);
      return tent ? `Tent ${tent.code || tent.name}` : "Tent";
    }
    if (scopeType === "TRAY") {
      const tray = trayById.get(firstScope);
      return tray ? `Tray ${tray.name}` : "Tray";
    }
    const plant = activePlants.find((item) => item.uuid === firstScope);
    return plant ? `Plant ${plant.plant_id || plant.uuid}` : "Plant";
  }, [activePlants, scopeType, selectedScopeIds, tentById, trayById]);

  const suggestedTitle = useMemo(
    () => `${actionTypeLabel(actionType)} - ${scopeSuggestionLabel} - ${recurrenceLabel}`,
    [actionType, recurrenceLabel, scopeSuggestionLabel],
  );

  useEffect(() => {
    if (!titleDirty) {
      setTitle(suggestedTitle);
    }
  }, [suggestedTitle, titleDirty]);

  const feedWarnings = useMemo(() => {
    if (actionType !== "FEED") {
      return [];
    }
    const warnings: string[] = [];
    if (summary?.lifecycle.state !== "running") {
      warnings.push("Blocked: Experiment not running");
    }

    const targetIds = new Set<string>();
    if (scopeType === "PLANT") {
      for (const id of selectedScopeIds) {
        targetIds.add(id);
      }
    } else if (scopeType === "TRAY") {
      for (const trayId of selectedScopeIds) {
        for (const plant of activePlants) {
          if (plant.location.tray?.id === trayId) {
            targetIds.add(plant.uuid);
          }
        }
      }
    } else {
      for (const tentId of selectedScopeIds) {
        for (const plant of activePlants) {
          if (plant.location.tent?.id === tentId) {
            targetIds.add(plant.uuid);
          }
        }
      }
    }

    let hasUnplaced = false;
    let hasMissingRecipe = false;
    for (const plant of activePlants) {
      if (!targetIds.has(plant.uuid)) {
        continue;
      }
      if (plant.location.status !== "placed") {
        hasUnplaced = true;
      } else if (!plant.assigned_recipe) {
        hasMissingRecipe = true;
      }
    }
    if (hasUnplaced) {
      warnings.push("Blocked: Unplaced");
    }
    if (hasMissingRecipe) {
      warnings.push("Blocked: Needs plant recipe");
    }
    return warnings;
  }, [actionType, activePlants, scopeType, selectedScopeIds, summary?.lifecycle.state]);

  const fetchScheduleData = useCallback(async () => {
    const planQuery = new URLSearchParams({
      days: String(daysWindow),
    });
    if (plantFilter) {
      planQuery.set("plant_id", plantFilter);
    }

    const [statusPayload, schedulesPayload, planPayload, placementPayload, overviewPayload] =
      await Promise.all([
        api.get<ExperimentStatusSummary>(`/api/v1/experiments/${experimentId}/status/summary`),
        api.get<{ schedules: { count: number; results: ScheduleAction[]; meta: Record<string, unknown> } }>(
          `/api/v1/experiments/${experimentId}/schedules`,
        ),
        api.get<SchedulePlan>(
          `/api/v1/experiments/${experimentId}/schedules/plan?${planQuery.toString()}`,
        ),
        api.get<PlacementSummary>(`/api/v1/experiments/${experimentId}/placement/summary`),
        api.get<{ plants: { count: number; results: OverviewPlant[]; meta: Record<string, unknown> } }>(
          `/api/v1/experiments/${experimentId}/overview/plants`,
        ),
      ]);

    return {
      statusPayload,
      schedulesPayload,
      planPayload,
      placementPayload,
      overviewPayload,
    };
  }, [daysWindow, experimentId, plantFilter]);

  const scheduleDataQueryKey = queryKeys.experiment.feature(
    experimentId,
    "scheduleData",
    { daysWindow, plantFilter: plantFilter || null },
  );

  const scheduleDataQuery = useQuery({
    queryKey: scheduleDataQueryKey,
    queryFn: fetchScheduleData,
    enabled: Boolean(experimentId),
  });

  const scheduleDataState = usePageQueryState(scheduleDataQuery);

  useEffect(() => {
    const payload = scheduleDataQuery.data;
    if (!payload) {
      return;
    }

    setSummary(payload.statusPayload);
    setActions(unwrapList<ScheduleAction>(payload.schedulesPayload.schedules));
    setPlan(payload.planPayload);
    setPlacementSummary(payload.placementPayload);
    setOverviewPlants(unwrapList<OverviewPlant>(payload.overviewPayload.plants));
  }, [scheduleDataQuery.data]);

  useEffect(() => {
    if (!experimentId || !summary) {
      return;
    }
    if (!summary.setup.is_complete) {
      router.replace(`/experiments/${experimentId}/setup`);
    }
  }, [experimentId, router, summary]);

  const reloadScheduleData = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.experiment.feature(experimentId, "scheduleData"),
    });
  }, [experimentId, queryClient]);

  const saveScheduleMutation = useMutation({
    mutationFn: async (args: {
      payload: Record<string, unknown>;
      editingId: string | null;
    }) => {
      if (args.editingId) {
        await api.patch(`/api/v1/schedules/${args.editingId}`, args.payload);
      } else {
        await api.post(`/api/v1/experiments/${experimentId}/schedules`, args.payload);
      }
    },
    onMutate: () => {
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onSuccess: async (_result, args) => {
      setNotice(args.editingId ? "Schedule updated." : "Schedule created.");
      resetForm();
      await reloadScheduleData();
    },
    onError: (requestError) => {
      if (isApiError(requestError)) {
        const payload = requestError.payload as { detail?: string; errors?: string[] } | undefined;
        const errors = Array.isArray(payload?.errors) ? payload?.errors.join(" ") : "";
        setError(payload?.detail || errors || requestError.detail || "Unable to save schedule.");
        return;
      }
      const normalized = normalizeUserFacingError(requestError, "Unable to save schedule.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError("Unable to save schedule.");
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async (args: { id: string; enabled: boolean }) => {
      await api.patch(`/api/v1/schedules/${args.id}`, { enabled: !args.enabled });
    },
    onMutate: () => {
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onSuccess: async () => {
      await reloadScheduleData();
    },
    onError: (requestError) => {
      if (isApiError(requestError)) {
        setError(requestError.detail || "Unable to update schedule state.");
        return;
      }
      const normalized = normalizeUserFacingError(requestError, "Unable to update schedule state.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError(normalized.message || "Unable to update schedule state.");
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (actionId: string) => {
      await api.delete(`/api/v1/schedules/${actionId}`);
    },
    onMutate: () => {
      setError("");
      setNotice("");
      setMutationOffline(false);
    },
    onSuccess: async (_result, actionId) => {
      setNotice("Schedule deleted.");
      if (editingId === actionId) {
        resetForm();
      }
      await reloadScheduleData();
    },
    onError: (requestError) => {
      if (isApiError(requestError)) {
        setError(requestError.detail || "Unable to delete schedule.");
        return;
      }
      const normalized = normalizeUserFacingError(requestError, "Unable to delete schedule.");
      if (normalized.kind === "offline") {
        setMutationOffline(true);
      }
      setError(normalized.message || "Unable to delete schedule.");
    },
  });

  const saving =
    saveScheduleMutation.isPending ||
    toggleEnabledMutation.isPending ||
    deleteScheduleMutation.isPending;

  function resetForm() {
    setEditingId(null);
    setActionType("FEED");
    setTitle("");
    setTitleDirty(false);
    setDescription("");
    setEnabled(true);
    setRecurrenceMode("weekly");
    setWeeklyRules([{ weekday: "MON", timeframe: "AFTERNOON", exact_time: "" }]);
    setIntervalDays(7);
    setIntervalTimeframe("AFTERNOON");
    setIntervalExactTime("");
    setDailyTimeframe("MORNING");
    setDailyExactTime("");
    setScopeType("TENT");
    setSelectedScopeIds([]);
  }

  function startEdit(action: ScheduleAction) {
    setEditingId(action.id);
    setActionType(action.action_type);
    setTitle(action.title);
    setTitleDirty(true);
    setDescription(action.description || "");
    setEnabled(action.enabled);

    if (action.rules.length > 0 && action.rules.every((rule) => rule.rule_type === "WEEKLY")) {
      setRecurrenceMode("weekly");
      setWeeklyRules(
        action.rules.map((rule) => ({
          weekday: rule.weekdays[0] || "MON",
          timeframe: rule.timeframe,
          exact_time: rule.exact_time ? rule.exact_time.slice(0, 5) : "",
        })),
      );
    } else if (action.rules.length === 1 && action.rules[0].rule_type === "CUSTOM_DAYS_INTERVAL") {
      setRecurrenceMode("interval");
      setIntervalDays(action.rules[0].interval_days || 7);
      setIntervalTimeframe(action.rules[0].timeframe);
      setIntervalExactTime(action.rules[0].exact_time ? action.rules[0].exact_time.slice(0, 5) : "");
    } else if (action.rules.length > 0) {
      setRecurrenceMode("daily");
      setDailyTimeframe(action.rules[0].timeframe);
      setDailyExactTime(action.rules[0].exact_time ? action.rules[0].exact_time.slice(0, 5) : "");
    }

    if (action.scopes.length > 0) {
      setScopeType(action.scopes[0].scope_type);
      setSelectedScopeIds(action.scopes.map((scope) => scope.scope_id));
    }
  }

  function buildRulesPayload() {
    if (recurrenceMode === "weekly") {
      return weeklyRules.map((rule) => ({
        rule_type: "WEEKLY",
        weekdays: [rule.weekday],
        timeframe: rule.timeframe,
        exact_time: rule.exact_time || null,
      }));
    }
    if (recurrenceMode === "interval") {
      return [
        {
          rule_type: "CUSTOM_DAYS_INTERVAL",
          interval_days: intervalDays,
          weekdays: [],
          timeframe: intervalTimeframe,
          exact_time: intervalExactTime || null,
        },
      ];
    }
    return [
      {
        rule_type: "DAILY",
        weekdays: [],
        timeframe: dailyTimeframe,
        exact_time: dailyExactTime || null,
      },
    ];
  }

  async function saveScheduleAction() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (selectedScopeIds.length === 0) {
      setError("Select at least one scope.");
      return;
    }
    const payload = {
      title: title.trim(),
      action_type: actionType,
      description: description.trim(),
      enabled,
      rules: buildRulesPayload(),
      scopes: selectedScopeIds.map((scopeId) => ({
        scope_type: scopeType,
        scope_id: scopeId,
      })),
    };
    await saveScheduleMutation.mutateAsync({ payload, editingId }).catch(() => null);
  }

  async function toggleEnabled(action: ScheduleAction) {
    await toggleEnabledMutation.mutateAsync({ id: action.id, enabled: action.enabled }).catch(() => null);
  }

  async function deleteScheduleAction(actionId: string) {
    await deleteScheduleMutation.mutateAsync(actionId).catch(() => null);
  }

  function toggleScopeSelection(scopeId: string) {
    setSelectedScopeIds((current) =>
      current.includes(scopeId) ? current.filter((item) => item !== scopeId) : [...current, scopeId],
    );
  }

  const traysGroupedByTent = useMemo(() => {
    const groups = new Map<string, Array<PlacementSummary["trays"]["results"][number]>>();
    for (const tray of placementSummary ? unwrapList<PlacementSummary["trays"]["results"][number]>(placementSummary.trays) : []) {
      const tent = tray.location.tent ? tentById.get(tray.location.tent.id) : null;
      const key = tent ? `Tent ${tent.code || tent.name}` : "Unplaced";
      const current = groups.get(key) || [];
      current.push(tray);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).sort((left, right) => left[0].localeCompare(right[0]));
  }, [placementSummary, tentById]);

  const plantsGroupedByLocation = useMemo(() => {
    const groups = new Map<string, OverviewPlant[]>();
    for (const plant of activePlants) {
      const tentLabel = plant.location.tent?.code || plant.location.tent?.name || "Unplaced";
      const trayLabel = plant.location.tray?.code || plant.location.tray?.name || "Unplaced";
      const key = plant.location.tray?.id
        ? `Tent ${tentLabel} > Tray ${trayLabel}`
        : "Unplaced";
      const current = groups.get(key) || [];
      current.push(plant);
      groups.set(key, current);
    }
    return Array.from(groups.entries()).sort((left, right) => left[0].localeCompare(right[0]));
  }, [activePlants]);

  const notInvited = scheduleDataState.errorKind === "forbidden";
  const loading = scheduleDataState.isLoading;
  const offline = mutationOffline || scheduleDataState.errorKind === "offline";
  const queryError =
    !notInvited && scheduleDataState.isError && scheduleDataState.errorKind !== "offline"
      ? "Unable to load schedule page."
      : "";

  if (notInvited) {
    return (
      <PageShell title="Schedule">
        <SectionCard>
          <PageAlerts notInvited />
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Schedule"
      subtitle={plantFilter ? "Filtered for selected plant" : "Recurring actions plan"}
      actions={
        <Link className={buttonVariants({ variant: "secondary" })} href={`/experiments/${experimentId}/overview`}>
          ← Overview
        </Link>
      }
    >
      <PageAlerts
        loading={loading}
        loadingText="Loading schedules..."
        error={error || queryError}
        notice={notice}
        offline={offline}
      />

      <SectionCard title="Upcoming plan">
        <div className={"flex flex-wrap items-center gap-2"}>
          <button
            className={daysWindow === 7 ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "secondary" })}
            type="button"
            onClick={() => setDaysWindow(7)}
          >
            7 days
          </button>
          <button
            className={daysWindow === 14 ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "secondary" })}
            type="button"
            onClick={() => setDaysWindow(14)}
          >
            14 days
          </button>
        </div>
        {plan && unwrapList<SchedulePlan["slots"]["results"][number]>(plan.slots).length ? (
          <div className={"grid gap-3"}>
            {unwrapList<SchedulePlan["slots"]["results"][number]>(plan.slots).map((slot) => (
              <article className={cn(styles.cellFrame, styles.cellSurfaceLevel1)} key={`${slot.date}-${slot.exact_time || slot.timeframe}`}>
                <strong>{formatSlotTitle(slot.date, slot.timeframe, slot.exact_time)}</strong>
                <div className={"grid gap-3"}>
                  {slot.actions.map((item) => (
                    <div className={"grid gap-2"} key={`${slot.date}-${item.schedule_id}-${item.title}`}>
                      <span>{item.title}</span>
                      <strong>{item.scope_summary || "No scope"}</strong>
                      {item.blocked_reasons.length > 0 ? (
                        <div className={"flex flex-wrap items-center gap-2"}>
                          {item.blocked_reasons.map((reason) => (
                            <Badge key={reason} variant="secondary">
                              {reason}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={"text-sm text-muted-foreground"}>No upcoming scheduled actions in this window.</p>
        )}
      </SectionCard>

      <SectionCard title={editingId ? "Edit action" : "Create action"}>
        <div className={"grid gap-3"}>
          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Action type</span>
            <NativeSelect
              value={actionType}
              onChange={(event) => setActionType(event.target.value as ActionType)}
              disabled={saving}
            >
              {ACTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </label>

          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Title</span>
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleDirty(true);
              }}
              disabled={saving}
            />
            <span className={"text-sm text-muted-foreground"}>Suggestion: {suggestedTitle}</span>
          </label>

          <label className={"grid gap-2"}>
            <span className={"text-sm text-muted-foreground"}>Description (optional)</span>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
            />
          </label>

          <label className={"flex flex-wrap items-center gap-2"}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              disabled={saving}
            />
            <span>Enabled</span>
          </label>

          <div className={"flex flex-wrap items-center gap-2"}>
            <button
              className={recurrenceMode === "weekly" ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "secondary" })}
              type="button"
              onClick={() => setRecurrenceMode("weekly")}
            >
              Weekly pattern
            </button>
            <button
              className={recurrenceMode === "interval" ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "secondary" })}
              type="button"
              onClick={() => setRecurrenceMode("interval")}
            >
              Every X days
            </button>
            <button
              className={recurrenceMode === "daily" ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "secondary" })}
              type="button"
              onClick={() => setRecurrenceMode("daily")}
            >
              Daily
            </button>
          </div>

          {recurrenceMode === "weekly" ? (
            <div className={"grid gap-3"}>
              {weeklyRules.map((rule, index) => (
                <article className={cn(styles.cellFrame, styles.cellSurfaceLevel1)} key={`${rule.weekday}-${index}`}>
                  <label className={"grid gap-2"}>
                    <span className={"text-sm text-muted-foreground"}>Weekday</span>
                    <NativeSelect
                      value={rule.weekday}
                      onChange={(event) =>
                        setWeeklyRules((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, weekday: event.target.value } : item,
                          ),
                        )
                      }
                    >
                      {WEEKDAY_OPTIONS.map((weekday) => (
                        <option key={weekday.value} value={weekday.value}>
                          {weekday.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <label className={"grid gap-2"}>
                    <span className={"text-sm text-muted-foreground"}>Timeframe</span>
                    <NativeSelect
                      value={rule.timeframe}
                      onChange={(event) =>
                        setWeeklyRules((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, timeframe: event.target.value as Timeframe }
                              : item,
                          ),
                        )
                      }
                    >
                      {TIMEFRAME_OPTIONS.map((timeframe) => (
                        <option key={timeframe.value} value={timeframe.value}>
                          {timeframe.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                  <label className={"grid gap-2"}>
                    <span className={"text-sm text-muted-foreground"}>Exact time (optional)</span>
                    <Input
                      type="time"
                      value={rule.exact_time}
                      onChange={(event) =>
                        setWeeklyRules((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, exact_time: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className={"flex flex-wrap items-center gap-2"}>
                    {weeklyRules.length > 1 ? (
                      <button
                        className={buttonVariants({ variant: "secondary" })}
                        type="button"
                        onClick={() =>
                          setWeeklyRules((current) => current.filter((_, itemIndex) => itemIndex !== index))
                        }
                      >
                        Remove rule
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              <button
                className={buttonVariants({ variant: "secondary" })}
                type="button"
                onClick={() =>
                  setWeeklyRules((current) => [
                    ...current,
                    { weekday: "MON", timeframe: "MORNING", exact_time: "" },
                  ])
                }
              >
                Add weekly rule
              </button>
            </div>
          ) : null}

          {recurrenceMode === "interval" ? (
            <div className={"grid gap-3"}>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Interval days</span>
                <Input
                  type="number"
                  min={1}
                  value={intervalDays}
                  onChange={(event) => setIntervalDays(Math.max(1, Number(event.target.value) || 1))}
                />
              </label>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Timeframe</span>
                <NativeSelect
                  value={intervalTimeframe}
                  onChange={(event) => setIntervalTimeframe(event.target.value as Timeframe)}
                >
                  {TIMEFRAME_OPTIONS.map((timeframe) => (
                    <option key={timeframe.value} value={timeframe.value}>
                      {timeframe.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Exact time (optional)</span>
                <Input
                  type="time"
                  value={intervalExactTime}
                  onChange={(event) => setIntervalExactTime(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {recurrenceMode === "daily" ? (
            <div className={"grid gap-3"}>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Timeframe</span>
                <NativeSelect
                  value={dailyTimeframe}
                  onChange={(event) => setDailyTimeframe(event.target.value as Timeframe)}
                >
                  {TIMEFRAME_OPTIONS.map((timeframe) => (
                    <option key={timeframe.value} value={timeframe.value}>
                      {timeframe.label}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className={"grid gap-2"}>
                <span className={"text-sm text-muted-foreground"}>Exact time (optional)</span>
                <Input
                  type="time"
                  value={dailyExactTime}
                  onChange={(event) => setDailyExactTime(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          <div className={"flex flex-wrap items-center gap-2"}>
            <button
              className={scopeType === "TENT" ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "secondary" })}
              type="button"
              onClick={() => {
                setScopeType("TENT");
                setSelectedScopeIds([]);
              }}
            >
              Tents
            </button>
            <button
              className={scopeType === "TRAY" ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "secondary" })}
              type="button"
              onClick={() => {
                setScopeType("TRAY");
                setSelectedScopeIds([]);
              }}
            >
              Trays
            </button>
            <button
              className={scopeType === "PLANT" ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "secondary" })}
              type="button"
              onClick={() => {
                setScopeType("PLANT");
                setSelectedScopeIds([]);
              }}
            >
              Plants
            </button>
          </div>

          {scopeType === "TENT" ? (
            <div className={"grid gap-3"}>
              {(placementSummary ? unwrapList<PlacementSummary["tents"]["results"][number]>(placementSummary.tents) : []).map((tent) => (
                <label className={"flex flex-wrap items-center gap-2"} key={tent.tent_id}>
                  <input
                    type="checkbox"
                    checked={selectedScopeIds.includes(tent.tent_id)}
                    onChange={() => toggleScopeSelection(tent.tent_id)}
                  />
                  <span>
                    Tent {tent.code || tent.name} ({compactAllowedSpeciesLabel(tent)})
                  </span>
                </label>
              ))}
              {(placementSummary ? unwrapList<PlacementSummary["tents"]["results"][number]>(placementSummary.tents).length : 0) === 0 ? (
                <p className={"text-sm text-muted-foreground"}>No tents available yet. Add tents in Placement step 1.</p>
              ) : null}
            </div>
          ) : null}

          {scopeType === "TRAY" ? (
            <div className={"grid gap-3"}>
              {traysGroupedByTent.map(([group, trays]) => (
                <article className={cn(styles.cellFrame, styles.cellSurfaceLevel1)} key={group}>
                  <strong>{group}</strong>
                  {trays.map((tray) => (
                    <label className={"flex flex-wrap items-center gap-2"} key={tray.tray_id}>
                      <input
                        type="checkbox"
                        checked={selectedScopeIds.includes(tray.tray_id)}
                        onChange={() => toggleScopeSelection(tray.tray_id)}
                      />
                      <span>
                        Tray {tray.name} ({tray.current_count}/{tray.capacity}){" "}
                        {trayRestrictionHint(tray, tentById)
                          ? ` · ${trayRestrictionHint(tray, tentById)}`
                          : ""}
                      </span>
                    </label>
                  ))}
                </article>
              ))}
              {(placementSummary ? unwrapList<PlacementSummary["trays"]["results"][number]>(placementSummary.trays).length : 0) === 0 ? (
                <p className={"text-sm text-muted-foreground"}>No trays available yet. Add trays in Placement.</p>
              ) : null}
            </div>
          ) : null}

          {scopeType === "PLANT" ? (
            <div className={"grid gap-3"}>
              {plantsGroupedByLocation.map(([group, plants]) => (
                <article className={cn(styles.cellFrame, styles.cellSurfaceLevel1)} key={group}>
                  <strong>{group}</strong>
                  {plants.map((plant) => (
                    <label className={"flex flex-wrap items-center gap-2"} key={plant.uuid}>
                      <input
                        type="checkbox"
                        checked={selectedScopeIds.includes(plant.uuid)}
                        onChange={() => toggleScopeSelection(plant.uuid)}
                      />
                      <span>
                        {plant.plant_id || "(pending)"} · {plant.species_name} ·{" "}
                        {plant.location.tray?.code || plant.location.tray?.name || "Unplaced"}
                      </span>
                    </label>
                  ))}
                </article>
              ))}
              {activePlants.length === 0 ? (
                <p className={"text-sm text-muted-foreground"}>No active plants available for scheduling.</p>
              ) : null}
            </div>
          ) : null}

          {feedWarnings.length > 0 ? (
            <div className={"flex flex-wrap items-center gap-2"}>
              {feedWarnings.map((warning) => (
                <Badge key={warning} variant="secondary">
                  {warning}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className={"flex flex-wrap items-center gap-2"}>
            <button
              className={buttonVariants({ variant: "default" })}
              type="button"
              disabled={saving}
              onClick={() => void saveScheduleAction()}
            >
              {saving ? "Saving..." : editingId ? "Update action" : "Create action"}
            </button>
            {editingId ? (
              <button
                className={buttonVariants({ variant: "secondary" })}
                type="button"
                disabled={saving}
                onClick={resetForm}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Existing actions">
        {actions.length === 0 ? (
          <p className={"text-sm text-muted-foreground"}>No schedule actions yet.</p>
        ) : (
          <div className={"grid gap-3"}>
            {actions.map((action) => (
              <article className={cn(styles.cellFrame, styles.cellSurfaceLevel1)} key={action.id}>
                <div className={"flex flex-wrap items-center gap-2"}>
                  <strong>{action.title}</strong>
                  <span className={"text-sm text-muted-foreground"}>{actionTypeLabel(action.action_type)}</span>
                </div>
                <p className={"text-sm text-muted-foreground"}>
                  {action.rules.map((rule) => summarizeRule(rule)).join(" · ")}
                </p>
                <p className={"text-sm text-muted-foreground"}>
                  {action.scopes.map((scope) => scope.label).join(", ")}
                </p>
                {action.current_blockers.length > 0 ? (
                  <div className={"flex flex-wrap items-center gap-2"}>
                    {action.current_blockers.map((reason) => (
                      <Badge key={reason} variant="secondary">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className={"flex flex-wrap items-center gap-2"}>
                  <label className={"flex flex-wrap items-center gap-2"}>
                    <input
                      type="checkbox"
                      checked={action.enabled}
                      disabled={saving}
                      onChange={() => void toggleEnabled(action)}
                    />
                    <span>Enabled</span>
                  </label>
                  <button
                    className={buttonVariants({ variant: "secondary" })}
                    type="button"
                    disabled={saving}
                    onClick={() => startEdit(action)}
                  >
                    Edit
                  </button>
                  <button
                    className={buttonVariants({ variant: "destructive" })}
                    type="button"
                    disabled={saving}
                    onClick={() => void deleteScheduleAction(action.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
