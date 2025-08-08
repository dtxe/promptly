#!/usr/bin/env bash
# Source this script with an activation token to begin capturing commands.
# Usage: source promptly.sh TOKEN USERNAME [SERVER_URL]

promptly_activate() {
  export PROMPTLY_TOKEN="$1"
  export PROMPTLY_USER="$2"
  export PROMPTLY_SERVER="${3:-http://localhost:3000}"
  export PROMPTLY_OUT_FILE="$(mktemp)"
  trap 'rm -f "$PROMPTLY_OUT_FILE"' EXIT

  promptly_post() {
    local exit_code=$?
    local cmd=$(history 1 | sed 's/^ *[0-9]* *//')
    local output=$(cat "$PROMPTLY_OUT_FILE")
    : > "$PROMPTLY_OUT_FILE"
    local json=$(jq -n --arg cmd "$cmd" --arg out "$output" --arg user "$PROMPTLY_USER" --argjson code $exit_code '{command:$cmd,output:$out,username:$user,exit_code:$code}')
    curl -s -X POST "$PROMPTLY_SERVER/api/command" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $PROMPTLY_TOKEN" \
      -d "$json" >/dev/null &
    return $exit_code
  }

  PROMPT_COMMAND=promptly_post
  exec > >(tee -a "$PROMPTLY_OUT_FILE") 2>&1
  echo 'Promptly CLI activated.'
}

promptly_activate "$@"
