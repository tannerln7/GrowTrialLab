"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";

import { getParamString } from "@/src/lib/routing";

export function useRouteParamString(name: string): string | null {
  const params = useParams<Record<string, string | string[]>>();
  const rawValue = params?.[name];
  return useMemo(() => getParamString(rawValue), [rawValue]);
}
