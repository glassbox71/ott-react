#!/usr/bin/env bash
set -uo pipefail

# Emulator-only output contains demo users, never production configuration.
# Bound SDK shutdown failures and retain diagnostics in the public CI summary.
timeout 60s npm run test:sports:chat 2>&1 | tee /tmp/ott-chat-emulator-tests.log
chat_result=${PIPESTATUS[0]}
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  cat /tmp/ott-chat-emulator-tests.log >> "$GITHUB_STEP_SUMMARY"
  node --input-type=module -e 'import {readFileSync} from "node:fs"; const output=readFileSync("/tmp/ott-chat-emulator-tests.log","utf8").slice(-6000).replaceAll("%","%25").replaceAll("\r","%0D").replaceAll("\n","%0A"); console.log("::notice title=Demo chat emulator diagnostics::"+output);'
fi
exit "$chat_result"
