---
difficulty: intermediate
---

# Functions

Bash functions are more limited than functions in most languages — no first-class return values, no typed parameters — but understanding how they actually work lets you work around these limits cleanly and write reusable code instead of copy-pasted blocks.

## Defining Functions

```bash
# Two syntaxes — functionally identical
function my_func { ... }
my_func() { ... }
```

Prefer the second form; it's POSIX-compatible.

## `local` Variables

Without `local`, every variable in a function is global. This is a constant source of bugs. Always use `local` for variables that shouldn't escape.

```bash
count=10                  # global
process() {
    local count=0         # shadows global; global unchanged after return
    (( count++ ))
}
```

## Return Values

`return N` sets the exit code (0-255). It does **not** return data. To return data, you have two options:

1. **Print and capture**: `result=$(my_func)` — spawns a subshell, captures stdout. Clean but has overhead and the subshell can't modify the parent's variables.
2. **Write to a nameref**: `declare -n _retval=$1` then assign `_retval="data"` — the caller provides a variable name, the function writes to it. No subshell.

```bash
get_sum() {
    declare -n _result=$1
    local -i total=0
    shift
    for n in "$@"; do (( total += n )); done
    _result=$total
}
get_sum myvar 1 2 3 4 5
echo "$myvar"   # 15
```

## Passing Arrays by Name (nameref)

You cannot pass an array as `"${arr[@]}"` and reconstruct it reliably inside a function unless it contains only simple values. The clean solution: pass the array name and use `declare -n`.

```bash
process_array() {
    declare -n _arr=$1    # nameref to the caller's array
    for item in "${_arr[@]}"; do
        echo "$item"
    done
}
files=(/etc/hosts /etc/os-release)
process_array files
```

## Recursive Functions

Bash supports recursion but there's no tail-call optimization. Deep recursion (hundreds of levels) will be slow and memory-inefficient. For algorithms with bounded depth (tree traversal with depth < ~50), it works fine.

## Sourcing Libraries

`source file` (or `. file`) runs the file in the current shell's context. Use it to split large scripts into function libraries. Convention: library files use `.sh` extension and define only functions (no code at the top level that runs immediately).

## Example

```bash
#!/usr/bin/env bash

# --- Basic function with local variables ---

greet() {
    local name="${1:?greet requires a name}"   # :? aborts if empty
    local greeting="${2:-Hello}"
    echo "$greeting, $name!"
}

greet "Alice"
greet "Bob" "Good morning"
# greet ""   # would abort with error message


# --- Return value via stdout capture ---

to_upper() {
    echo "${1^^}"           # Bash 4+ parameter expansion for uppercase
}

name=$(to_upper "alice")
echo "$name"   # ALICE


# --- Return value via nameref (no subshell) ---

join_array() {
    local -n _result=$1     # output variable
    local sep=$2
    shift 2
    local -a items=("$@")
    local IFS="$sep"
    _result="${items[*]}"
}

join_array output "," "alpha" "beta" "gamma"
echo "$output"   # alpha,beta,gamma


# --- Array by nameref: modify in place ---

map_array() {
    local -n _arr=$1
    local transform=$2    # name of a transform function

    for i in "${!_arr[@]}"; do
        _arr[$i]=$("$transform" "${_arr[$i]}")
    done
}

shout() { echo "${1^^}!"; }

words=(hello world foo)
map_array words shout
echo "${words[@]}"   # HELLO! WORLD! FOO!


# --- Returning multiple values via namerefs ---

parse_url() {
    # parse_url <url> <scheme_var> <host_var> <path_var>
    local url="$1"
    local -n _scheme=$2
    local -n _host=$3
    local -n _path=$4

    _scheme="${url%%://*}"
    local rest="${url#*://}"
    _host="${rest%%/*}"
    _path="/${rest#*/}"
    [[ "$_path" == "/" && "${rest}" != */* ]] && _path=""
}

parse_url "https://example.com/api/v1" scheme host path
echo "scheme=$scheme host=$host path=$path"
# scheme=https host=example.com path=/api/v1


# --- Recursive function: directory tree ---

tree_walk() {
    local dir="$1"
    local indent="${2:-}"
    local entry

    for entry in "$dir"/*/; do
        [[ -d "$entry" ]] || continue
        echo "${indent}$(basename "$entry")/"
        tree_walk "$entry" "${indent}  "
    done
}

# tree_walk /etc   # uncomment to test


# --- Function library pattern ---
# In a real project, save this as lib/logging.sh and source it

# --- lib/logging.sh ---
_LOG_LEVEL=${LOG_LEVEL:-INFO}

_log() {
    local level="$1"; shift
    local message="$*"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    printf '[%s] [%-5s] %s\n' "$timestamp" "$level" "$message" >&2
}

log_info()  { [[ "$_LOG_LEVEL" != "ERROR" ]]                   && _log INFO  "$@"; }
log_warn()  { [[ "$_LOG_LEVEL" != "ERROR" ]]                   && _log WARN  "$@"; }
log_error() { _log ERROR "$@"; }

log_info  "Starting process"
log_warn  "Config file not found, using defaults"
log_error "Connection refused"


# --- Argument parsing pattern with a function ---

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS] <input>

Options:
  -o, --output FILE   Output file (default: stdout)
  -v, --verbose       Enable verbose output
  -n, --dry-run       Don't make changes
  -h, --help          Show this help
EOF
}

parse_args() {
    local -n _opts=$1
    shift

    _opts[output]=""
    _opts[verbose]=false
    _opts[dry_run]=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -o|--output)  _opts[output]="${2:?--output requires a file}"; shift ;;
            -v|--verbose) _opts[verbose]=true ;;
            -n|--dry-run) _opts[dry_run]=true ;;
            -h|--help)    usage; exit 0 ;;
            --)           shift; break ;;
            -*)           echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
            *)            break ;;
        esac
        shift
    done
}

declare -A opts
parse_args opts -v --dry-run -o /tmp/out.txt

echo "output=${opts[output]} verbose=${opts[verbose]} dry_run=${opts[dry_run]}"
# output=/tmp/out.txt verbose=true dry_run=true
```

## Why This Matters

Functions in Bash are what separate "a script that works" from "a script that's maintainable." Once you have a `log_error` function, every script that sources your library has consistent log output. Once you have a `parse_args` function, you stop writing bespoke argument handling loops in every script.

The nameref pattern is particularly underused. Most Bash scripts work around the "no return value" limitation by using global variables, which creates implicit coupling. Nameref makes the coupling explicit and scoped.

## Exercise

Write a function `retry` that:

1. Takes a max-attempts count as the first argument, a delay in seconds as the second, and a command (with its arguments) starting at the third.
2. Runs the command. If it exits 0, return 0.
3. If it fails, wait the delay and try again, up to max-attempts times.
4. On final failure, print the error count to stderr and return 1.

```bash
retry 3 2 curl -sf https://example.com -o /dev/null
```

Then write a `with_timeout` wrapper that kills the command if it runs longer than N seconds (use `$!` and `kill`).

<details>
<summary>Hint</summary>
In `retry`, use a `for` loop from 1 to max_attempts. Run the command with `"${@:3}"` (all args from position 3 onward). Check `$?` after each attempt. For `with_timeout`: run the command in the background with `&`, capture `$!`, then `sleep N &` and capture that PID too, then `wait -n` (Bash 4.3+) or use a manual poll loop. Kill whichever is still running.
</details>

<details>
<summary>Solution</summary>

```bash
#!/usr/bin/env bash

retry() {
    local max_attempts=$1
    local delay=$2
    shift 2
    local attempt

    for (( attempt=1; attempt<=max_attempts; attempt++ )); do
        if "$@"; then
            return 0
        fi
        if (( attempt < max_attempts )); then
            echo "Attempt $attempt/$max_attempts failed. Retrying in ${delay}s..." >&2
            sleep "$delay"
        fi
    done

    echo "All $max_attempts attempts failed." >&2
    return 1
}

with_timeout() {
    local timeout=$1
    shift

    "$@" &
    local cmd_pid=$!

    (
        sleep "$timeout"
        kill "$cmd_pid" 2>/dev/null
    ) &
    local sleep_pid=$!

    wait "$cmd_pid"
    local exit_code=$?

    # Kill the sleep watchdog if command finished first
    kill "$sleep_pid" 2>/dev/null
    wait "$sleep_pid" 2>/dev/null

    return "$exit_code"
}

# Test retry
echo "--- retry test ---"
attempt_count=0
flaky_command() {
    (( attempt_count++ ))
    echo "  attempt $attempt_count"
    (( attempt_count < 3 ))   # fail first 2 times
}
retry 4 0 flaky_command && echo "succeeded" || echo "failed"

# Test with_timeout
echo ""
echo "--- with_timeout test (2s timeout on 5s sleep) ---"
with_timeout 2 sleep 5 && echo "completed" || echo "timed out"
```

</details>
