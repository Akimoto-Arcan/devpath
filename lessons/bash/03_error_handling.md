---
difficulty: intermediate
---

# Error Handling

The default behavior of a Bash script is to keep running after errors. A command fails, Bash shrugs, and the next line runs with whatever broken state the failed command left behind. This is how scripts "work" for years and then corrupt production data. Good error handling is opt-in, but once you know the tools, opting in takes about three lines.

## The `set` Options

Put these at the top of every non-trivial script:

```bash
set -euo pipefail
```

- **`-e` (errexit)**: exit immediately if a command returns a non-zero exit code. With caveats: commands in `if` conditions, `while`/`until` conditions, and after `||`/`&&` are exempt — Bash knows you're handling those.
- **`-u` (nounset)**: treat references to undefined variables as errors. Catches typos like `$DIRECOTRY`.
- **`-o pipefail`**: normally, a pipeline `a | b | c` returns the exit code of the last command. With `pipefail`, it returns the exit code of the first failed command in the pipe.

`-e` has edge cases. It does not catch every error. It's a safety net, not a substitute for explicit checks.

## Exit Codes

Every command returns an exit code 0-255. Zero means success; any non-zero means failure (the specific value is program-defined). Check with `$?` immediately after a command — it's overwritten by the next command. Better: use `if command; then` or `command || handle_error`.

## `trap` for Cleanup

`trap 'command' SIGNAL` runs a command when a signal is received or a special condition occurs:

- `EXIT`: fires whenever the script exits (any reason). Use for cleanup.
- `ERR`: fires when a command fails (works well with `-e`).
- `INT`: Ctrl-C (SIGINT).
- `TERM`: kill signal.

Cleanup trap pattern:

```bash
cleanup() {
    rm -f "$tmpfile"
    echo "cleaned up" >&2
}
trap cleanup EXIT
tmpfile=$(mktemp)
```

## `||` and `&&` for Inline Error Handling

```bash
command || { echo "failed" >&2; exit 1; }
command && echo "success"
```

These are cleaner than `if` when the condition is just one command and the action is a one-liner. Use `{ ... ; }` (note the spaces and semicolon) for multi-command blocks.

## Example

```bash
#!/usr/bin/env bash
# Production-grade error handling patterns

set -euo pipefail

# --- Cleanup with trap ---

TMPDIR_WORK=""
cleanup() {
    local exit_code=$?
    if [[ -n "$TMPDIR_WORK" && -d "$TMPDIR_WORK" ]]; then
        rm -rf "$TMPDIR_WORK"
        echo "[cleanup] removed $TMPDIR_WORK" >&2
    fi
    if (( exit_code != 0 )); then
        echo "[cleanup] script exited with code $exit_code" >&2
    fi
}
trap cleanup EXIT

# Trap SIGINT/SIGTERM to ensure cleanup runs (EXIT trap also fires, but this
# lets us print a specific message)
trap 'echo "" >&2; echo "Interrupted." >&2; exit 130' INT TERM

TMPDIR_WORK=$(mktemp -d)
echo "Working in $TMPDIR_WORK"


# --- ERR trap with line numbers ---

err_handler() {
    local exit_code=$?
    local line=$1
    echo "[ERROR] command failed with exit code $exit_code at line $line" >&2
}
trap 'err_handler $LINENO' ERR


# --- Explicit exit code checking ---

check_dependency() {
    local cmd="$1"
    if ! command -v "$cmd" &>/dev/null; then
        echo "[ERROR] required command not found: $cmd" >&2
        exit 1
    fi
}

check_dependency bash
check_dependency awk
check_dependency sed


# --- pipefail in action ---

# Without pipefail, this would silently succeed even if grep found nothing:
# false | grep "pattern" | wc -l

# With pipefail, the first command's failure propagates.
# Use || true to intentionally ignore a specific command's failure:
count=$(echo "hello world" | grep -c "hello" || true)
echo "grep count: $count"


# --- Handling errors with context ---

die() {
    local msg="${1:-Unknown error}"
    local code="${2:-1}"
    echo "[FATAL] $msg" >&2
    exit "$code"
}

warn() {
    echo "[WARN] $*" >&2
}

require_file() {
    local path="$1"
    [[ -f "$path" ]] || die "required file not found: $path"
}

require_dir() {
    local path="$1"
    [[ -d "$path" ]] || die "required directory not found: $path"
}

require_var() {
    local name="$1"
    [[ -n "${!name}" ]] || die "required variable not set: $name"
}

# Usage: these abort on failure
require_dir /tmp
# require_file /nonexistent   # would exit with message


# --- Retry with error tracking ---

run_with_retry() {
    local max=${1}; local delay=${2}; shift 2
    local attempt=1

    until "$@"; do
        if (( attempt >= max )); then
            die "Command failed after $max attempts: $*"
        fi
        warn "Attempt $attempt failed. Retry in ${delay}s."
        sleep "$delay"
        (( attempt++ ))
    done
}

# Simulate a command that fails a couple times
_attempt=0
flaky() {
    (( _attempt++ ))
    (( _attempt >= 3 ))   # exits 0 on third attempt
}

run_with_retry 5 0 flaky
echo "flaky() eventually succeeded"


# --- Subshell isolation: contain failures ---

# Run a risky block without letting it kill the whole script
if ! (
    set -e
    cd "$TMPDIR_WORK"
    echo "data" > test.txt
    false              # simulated failure
    echo "unreachable"
); then
    warn "inner block failed, continuing"
fi
echo "Script continued after contained failure"


# --- Validate inputs before doing anything destructive ---

deploy() {
    local env="${1:-}"
    local version="${2:-}"

    [[ -n "$env" ]]     || die "deploy: environment required"
    [[ -n "$version" ]] || die "deploy: version required"

    case "$env" in
        dev|staging|production) ;;
        *) die "deploy: unknown environment: $env" ;;
    esac

    if [[ "$env" == "production" ]]; then
        read -rp "Deploy $version to PRODUCTION? [yes/N] " confirm
        [[ "$confirm" == "yes" ]] || die "Aborted by user."
    fi

    echo "Deploying $version to $env..."
    # ... actual deploy logic ...
}

# deploy staging 1.2.3   # uncomment to test


echo "Script completed successfully."
```

## Why This Matters

A Bash script without `set -euo pipefail` is a script that can silently partially complete — leaving a system in an inconsistent state — and exit 0. In deployment scripts, database migration scripts, and backup scripts, partial completion is often worse than complete failure. The cleanup trap and the error handler turn "silent partial completion" into "loud fast failure," which is much easier to debug and recover from.

The `die`/`warn` pattern also standardizes error output to stderr (where it belongs) and ensures exit codes are meaningful, so callers and monitoring systems can detect failure.

## Exercise

Write a script `safe_backup.sh` that:

1. Takes a source directory and a destination directory as arguments. Validate both exist.
2. Creates a timestamped backup: `$DEST/backup_YYYYMMDD_HHMMSS.tar.gz`.
3. Uses a trap to clean up a partial `.tar.gz` if the script fails mid-archive.
4. Verifies the archive is valid with `tar -tzf` after creation.
5. Prints success with the archive size, or fails loudly with a clear message.

Use `set -euo pipefail` and proper error handling throughout.

<details>
<summary>Hint</summary>
Create the archive path before starting: `archive="$dest/backup_$(date +%Y%m%d_%H%M%S).tar.gz"`. Set your trap to `rm -f "$archive"` on EXIT, but only if the file exists and the exit code is non-zero (check `$?` in the trap function). Run `tar -czf "$archive" -C "$(dirname "$src")" "$(basename "$src")"`. Verify with `tar -tzf "$archive" > /dev/null`.
</details>

<details>
<summary>Solution</summary>

```bash
#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo "Usage: $0 <source_dir> <dest_dir>" >&2
    exit 1
}

die() { echo "[ERROR] $*" >&2; exit 1; }

[[ $# -eq 2 ]] || usage

src="$(realpath "$1")"
dest="$(realpath "$2")"

[[ -d "$src"  ]] || die "Source directory not found: $src"
[[ -d "$dest" ]] || die "Destination directory not found: $dest"

archive="${dest}/backup_$(date +%Y%m%d_%H%M%S).tar.gz"

cleanup() {
    local code=$?
    if (( code != 0 )) && [[ -f "$archive" ]]; then
        echo "[cleanup] removing partial archive: $archive" >&2
        rm -f "$archive"
    fi
}
trap cleanup EXIT

echo "Archiving: $src -> $archive"
tar -czf "$archive" -C "$(dirname "$src")" "$(basename "$src")"

echo "Verifying archive..."
tar -tzf "$archive" > /dev/null || die "Archive verification failed"

size=$(du -sh "$archive" | cut -f1)
echo "Backup complete: $archive ($size)"
```

</details>
