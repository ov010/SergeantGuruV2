#!/usr/bin/env bash
# SergeantGuruV2 launcher for Linux (Arch / CachyOS)
#
# Run it with:
#   bash "Start SergeantGuruV2.sh"
#
# Calling it through bash always works. "./Start SergeantGuruV2.sh" also works
# while the drive stays mounted with exec enabled, but exFAT/NTFS cannot store
# the executable bit, so bash is the reliable form.

set -uo pipefail

# --------------------------------------------------------------------------
# Move to the project root, i.e. the folder this script lives in.
# --------------------------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")" && pwd)"
cd -- "$SCRIPT_DIR" || { echo "Cannot change to the project folder." >&2; exit 1; }

OLLAMA_DEFAULT_URL="http://127.0.0.1:11434"
OLLAMA_DEFAULT_MODEL="qwen2.5:1.5b"

# Read a single value out of .env without executing it.
env_get() {
    [ -f .env ] || return 0
    sed -n "s/^[[:space:]]*$1=//p" .env | tail -n 1 \
        | tr -d '\r' \
        | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

echo "========================================"
echo "      SergeantGuruV2 Launcher"
echo "========================================"
echo

# --------------------------------------------------------------------------
# Prerequisites
# --------------------------------------------------------------------------
MISSING=0

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is not installed."
    echo "  Install it with:  sudo pacman -S --needed nodejs npm"
    MISSING=1
elif ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' 2>/dev/null; then
    echo "Node.js $(node -v) is too old; this project needs 22.13 or newer."
    echo "  Update it with:   sudo pacman -S --needed nodejs npm"
    MISSING=1
fi

if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is not installed."
    echo "  Install it with:  sudo pacman -S --needed pnpm"
    echo "  (or:  corepack enable pnpm)"
    MISSING=1
fi

if ! command -v curl >/dev/null 2>&1; then
    echo "curl is not installed."
    echo "  Install it with:  sudo pacman -S --needed curl"
    MISSING=1
fi

if [ "$MISSING" -ne 0 ]; then
    echo
    echo "Cannot start the bot until the items above are installed."
    exit 1
fi

if [ ! -f .env ]; then
    echo "No .env file found in $SCRIPT_DIR"
    echo "Copy .env.example to .env and fill in DISCORD_BOT_TOKEN and"
    echo "ROBLOX_OPEN_CLOUD_API_KEY, then run this script again."
    exit 1
fi

if [ ! -f node_modules/discord.js/package.json ] || [ ! -f node_modules/esbuild/package.json ]; then
    echo "Dependencies are not installed yet."
    echo "  Run this first:   pnpm install"
    echo
fi

# --------------------------------------------------------------------------
# Ollama (optional)
# --------------------------------------------------------------------------
OLLAMA_URL="$(env_get OLLAMA_BASE_URL)"
OLLAMA_URL="${OLLAMA_URL:-$OLLAMA_DEFAULT_URL}"
OLLAMA_MODEL="$(env_get OLLAMA_MODEL)"
OLLAMA_MODEL="${OLLAMA_MODEL:-$OLLAMA_DEFAULT_MODEL}"

ollama_up() {
    curl -s --max-time 2 -o /dev/null "$OLLAMA_URL/api/tags"
}

echo "Checking Ollama (optional)..."

if ollama_up; then
    echo "Ollama is ready."
    echo
    echo "Loading the local Alt Risk model..."
    curl -s --max-time 60 -o /dev/null \
        "$OLLAMA_URL/api/generate" \
        -d "{\"model\":\"$OLLAMA_MODEL\",\"prompt\":\"hello\",\"stream\":false}"
elif command -v ollama >/dev/null 2>&1; then
    echo "Starting Ollama..."
    nohup ollama serve >/tmp/sergeantguru-ollama.log 2>&1 &
    disown 2>/dev/null || true

    OLLAMA_WAIT=0
    until ollama_up; do
        sleep 1
        OLLAMA_WAIT=$((OLLAMA_WAIT + 1))
        if [ "$OLLAMA_WAIT" -ge 15 ]; then
            echo "Ollama did not respond in time, so it will be skipped."
            echo "Continuing without AI review. Alt Risk uses the rule-based score."
            break
        fi
    done

    if ollama_up; then
        echo "Ollama is ready."
        echo
        echo "Loading the local Alt Risk model..."
        curl -s --max-time 60 -o /dev/null \
            "$OLLAMA_URL/api/generate" \
            -d "{\"model\":\"$OLLAMA_MODEL\",\"prompt\":\"hello\",\"stream\":false}"
    fi
else
    echo "Ollama is not installed."
    echo "Continuing without AI review. Alt Risk uses the rule-based score."
    echo "  To enable it later:  sudo pacman -S --needed ollama"
    echo "                       sudo systemctl enable --now ollama"
    echo "                       ollama pull $OLLAMA_MODEL"
fi

# --------------------------------------------------------------------------
# Start the bot
# --------------------------------------------------------------------------
echo
echo "Starting Discord bot..."
echo

pnpm start
EXIT_CODE=$?

echo
echo "========================================"
echo "Bot process exited."
echo "Exit code: $EXIT_CODE"
echo "========================================"
echo

# Keep the terminal open after the bot exits, so errors stay readable.
if [ -t 0 ]; then
    read -r -n 1 -s -p "Press any key to close..."
    echo
fi

exit "$EXIT_CODE"
