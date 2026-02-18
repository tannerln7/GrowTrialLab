#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

MAX_NON_TOKEN_HEX="${MAX_NON_TOKEN_HEX:-1}"
MAX_ARBITRARY_UTILS="${MAX_ARBITRARY_UTILS:-120}"

failed=0

print_check() {
  printf '\n[tailwind-drift] %s\n' "$1"
}

fail_with_matches() {
  local message="$1"
  local matches="$2"
  echo "[FAIL] $message"
  echo "$matches"
  failed=1
}

print_check "No CSS modules in high-traffic routes"
css_module_matches="$(rg -n "\\.module\\.css" frontend/app/experiments frontend/app/p --glob '*.{ts,tsx}' || true)"
if [[ -n "$css_module_matches" ]]; then
  fail_with_matches "CSS modules were imported in experiments/cockpit routes" "$css_module_matches"
else
  echo "[OK] No CSS module imports in high-traffic routes"
fi

print_check "No !important usage"
important_matches="$(rg -n "!important" frontend --glob '*.{ts,tsx,css}' || true)"
if [[ -n "$important_matches" ]]; then
  fail_with_matches "Found !important declarations" "$important_matches"
else
  echo "[OK] No !important declarations"
fi

print_check "No dynamically constructed Tailwind utility classes"
class_template_matches="$(rg -n 'className=\{`' frontend/app frontend/src --glob '*.{ts,tsx}' || true)"
class_template_matches="$(printf '%s\n' "$class_template_matches" | rg -v 'frontend/app/layout.tsx' || true)"
if [[ -n "$class_template_matches" ]]; then
  fail_with_matches "Found className template strings (excluding Next font vars in layout)" "$class_template_matches"
else
  echo "[OK] No className template strings for utility classes"
fi

dynamic_utility_matches="$(rg -n '(bg|text|border|ring|p|m|w|h)-\$\{' frontend/app frontend/src --glob '*.{ts,tsx}' || true)"
if [[ -n "$dynamic_utility_matches" ]]; then
  fail_with_matches 'Found dynamic utility interpolation (e.g. bg-${x})' "$dynamic_utility_matches"
else
  echo "[OK] No dynamic Tailwind utility interpolation"
fi

print_check "Legacy gt-* class tokens are not reintroduced"
legacy_gt_matches="$(rg -n '\bgt-[a-z0-9-]+' frontend/app frontend/src --glob '*.{ts,tsx,css}' || true)"
legacy_gt_matches="$(printf '%s\n' "$legacy_gt_matches" | grep -Fv 'var(--gt-' | grep -Fv -- '--gt-' || true)"
if [[ -n "$legacy_gt_matches" ]]; then
  fail_with_matches "Found legacy gt-* class tokens" "$legacy_gt_matches"
else
  echo "[OK] No legacy gt-* class tokens"
fi

print_check "Non-token hex color literals remain below threshold"
non_token_hex_matches="$(rg -n '#[0-9A-Fa-f]{3,8}\b' frontend --glob '*.{ts,tsx,css}' || true)"
non_token_hex_matches="$(printf '%s\n' "$non_token_hex_matches" | grep -Ev 'frontend/src/styles/tokens.css|frontend/src/styles/tailwind-theme.css' || true)"
non_token_hex_count="$(printf '%s\n' "$non_token_hex_matches" | sed '/^$/d' | wc -l | tr -d ' ')"
if (( non_token_hex_count > MAX_NON_TOKEN_HEX )); then
  fail_with_matches "Found $non_token_hex_count non-token hex literals (threshold: $MAX_NON_TOKEN_HEX)" "$non_token_hex_matches"
else
  echo "[OK] Non-token hex literals: $non_token_hex_count (threshold: $MAX_NON_TOKEN_HEX)"
fi

print_check "Arbitrary utility usage remains below threshold"
arbitrary_utility_count="$( (rg -n '"[^"]*\[[^"]+\][^"]*"' frontend/app frontend/src --glob '*.{ts,tsx}' || true) | wc -l | tr -d ' ' )"
if (( arbitrary_utility_count > MAX_ARBITRARY_UTILS )); then
  echo "[FAIL] Arbitrary utility count $arbitrary_utility_count exceeds threshold $MAX_ARBITRARY_UTILS"
  echo "       Review with: rg -n '\"[^\"]*\\[[^\"]+\\][^\"]*\"' frontend/app frontend/src --glob '*.{ts,tsx}'"
  failed=1
else
  echo "[OK] Arbitrary utility count: $arbitrary_utility_count (threshold: $MAX_ARBITRARY_UTILS)"
fi

if (( failed )); then
  printf '\n[tailwind-drift] Failed\n'
  exit 1
fi

printf '\n[tailwind-drift] Passed\n'
