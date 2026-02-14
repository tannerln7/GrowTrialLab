# UI Illustration Inventory

This file tracks illustration placeholders used in the UI before final artwork exists.

| Inventory ID | Description | Where Used | Placeholder Kind | Lucide Icon |
| --- | --- | --- | --- | --- |
| ILL-001 | Not invited / access denied from `/api/me` | `frontend/app/page.tsx`, `frontend/app/experiments/page.tsx`, `frontend/app/experiments/new/page.tsx`, `frontend/app/experiments/[id]/setup/page.tsx`, `frontend/app/experiments/[id]/plants/page.tsx`, `frontend/app/experiments/[id]/baseline/page.tsx`, `frontend/app/p/[id]/page.tsx` | `notInvited` | `UserX` |
| ILL-101 | Experiments list empty state | `frontend/app/experiments/page.tsx` | `noExperiments` | `FlaskConical` |
| ILL-201 | Plants empty state | `frontend/app/experiments/[id]/setup/page.tsx`, `frontend/app/experiments/[id]/plants/page.tsx`, `frontend/app/experiments/[id]/baseline/page.tsx` | `noPlants` | `Sprout` |
| ILL-203 | Plant not found from QR lookup | `frontend/app/p/[id]/page.tsx` | `error` | `TriangleAlert` |
| ILL-002 | Generic error state | Reserved for API/load errors | `error` | `TriangleAlert` |
| ILL-003 | Backend offline state | `frontend/app/page.tsx`, `frontend/app/experiments/page.tsx`, `frontend/app/experiments/new/page.tsx`, `frontend/app/experiments/[id]/setup/page.tsx`, `frontend/app/experiments/[id]/plants/page.tsx`, `frontend/app/experiments/[id]/baseline/page.tsx`, `frontend/app/p/[id]/page.tsx`, `frontend/app/offline/page.tsx` | `offline` | `WifiOff` |
