---
difficulty: intermediate
---

# Process Substitution and Advanced Pipes

Once you move past basic pipes, you run into situations where a command needs a *file* as input but you only have a *command's output*. Or you want to pipe into a command that reads multiple files simultaneously. Process substitution solves both.

## Process Substitution: `<(cmd)` and `>(cmd)`

`<(cmd)` runs `cmd` and makes its output available as a named pipe (a file path like `/dev/fd/63`). The outer command sees a file path it can open, not a stdin stream. This matters when a command needs to seek or read a filename argument directly.

`>(cmd)` is the mirror: it gives you a path that, when written to, pipes into `cmd`.

```bash
diff <(sort file1) <(sort file2)     # diff two sorted streams
tee >(gzip > out.gz) >(wc -l) > /dev/null   # write to two sinks simultaneously
```

Key constraint: the inner command runs in a **subshell**. Variables set inside `<()` or `>()` do not affect the parent shell.

## Here-Documents (`<<EOF`)

A here-doc passes a multi-line string to a command's stdin. The delimiter (`EOF` by convention, but any word works) must appear alone on a line to close it.

```bash
cat <<EOF
line 1
line 2
EOF
```

`<<'EOF'` (quoted delimiter) disables variable expansion inside the here-doc — useful when the content is a script or config that has its own `$variables`.

`<<-EOF` strips leading **tabs** (not spaces) from each line — lets you indent the here-doc body with your code.

## Here-Strings (`<<<`)

`<<< "string"` passes a single string as stdin. Cleaner than `echo "string" | command` — no subshell, no newline issues.

```bash
read -r first rest <<< "hello world foo"
echo "$first"   # hello
echo "$rest"    # world foo
```

## Named Pipes (`mkfifo`)

`mkfifo` creates a persistent named pipe in the filesystem. Two separate processes can communicate through it — one writes, one reads. Unlike anonymous pipes (|), both ends can be opened independently and asynchronously. Good for coordinating processes that are launched separately.

## `tee`, `xargs`, Parallel Execution

- `tee file`: write stdin to both stdout and a file simultaneously. `tee -a` appends.
- `xargs`: build commands from stdin. `-P N` runs N in parallel. `-I{}` sets a placeholder.
- Background jobs with `&` and `wait`: launch multiple processes, then `wait` for all. `wait $pid` waits for a specific PID. `wait` (no args) waits for all background jobs.

## Subshells vs Current Shell

`(commands)` creates a subshell — a child process that inherits variables but cannot modify the parent's. Any `cd`, variable assignment, or `set` inside `()` is local to the subshell.

This is why `while read` loops that set variables often "don't work": `command | while read` runs the while loop in a subshell.

```bash
# Bug: count is set in a subshell, parent never sees it
count=0
echo "a b c" | while read word; do (( count++ )); done
echo $count   # 0 — subshell!

# Fix: use process substitution to keep the loop in the current shell
while read word; do (( count++ )); done < <(echo "a b c" | tr ' ' '\n')
echo $count   # 3
```

## Example

```bash
#!/usr/bin/env bash
set -euo pipefail

# --- Process substitution: diff two command outputs ---

echo "=== diff of sorted outputs ==="
diff \
    <(printf 'banana\napple\ncherry\n' | sort) \
    <(printf 'apple\ncherry\ndate\n'   | sort) \
|| true   # diff exits 1 if files differ; don't let -e kill us


# --- Process substitution: comm (requires sorted input) ---

echo ""
echo "=== common lines between two streams ==="
comm -12 \
    <(printf 'alpha\nbeta\ngamma\n' | sort) \
    <(printf 'beta\ngamma\ndelta\n' | sort)
# Output: beta
#         gamma


# --- tee: fan out to multiple sinks ---

echo ""
echo "=== tee: log to file and count lines ==="
logfile=$(mktemp)
line_count=$(
    printf 'line1\nline2\nline3\nline4\nline5\n' \
    | tee "$logfile" \
    | wc -l
)
echo "Lines written: $line_count"
echo "Log contents: $(cat "$logfile")"
rm -f "$logfile"


# --- Double tee: write to two files and stdout simultaneously ---

echo ""
echo "=== split stream three ways ==="
tmp1=$(mktemp); tmp2=$(mktemp)
seq 1 6 | tee "$tmp1" | tee "$tmp2" | paste - -   # paste: 2 columns
echo "tmp1: $(cat "$tmp1" | tr '\n' ' ')"
echo "tmp2: $(cat "$tmp2" | tr '\n' ' ')"
rm -f "$tmp1" "$tmp2"


# --- Here-doc: generate a config file ---

echo ""
echo "=== here-doc config generation ==="
db_host="db.internal"
db_port=5432
db_name="myapp"

config_file=$(mktemp --suffix=.conf)
cat > "$config_file" <<EOF
# Generated $(date)
[database]
host = $db_host
port = $db_port
name = $db_name
EOF

cat "$config_file"
rm -f "$config_file"

# Quoted here-doc: no variable expansion
echo ""
echo "=== quoted here-doc (literal dollar signs) ==="
cat <<'SCRIPT'
#!/bin/bash
echo "PATH is $PATH"
echo "HOME is $HOME"
SCRIPT


# --- Here-string: avoiding echo | command ---

echo ""
echo "=== here-string ==="
# Read into variables without a subshell
read -r proto host path <<< "$(echo 'https://example.com/api' | \
    sed 's|://| |; s|/| |')"
echo "proto=$proto host=$host path=$path"

# Base64 decode without echo subshell
decoded=$(base64 -d <<< "SGVsbG8gV29ybGQ=")
echo "decoded: $decoded"


# --- Subshell vs current shell: the pipe trap ---

echo ""
echo "=== subshell variable trap ==="

# BUG pattern: variables in piped while don't persist
total_bad=0
printf '10\n20\n30\n' | while read -r n; do
    (( total_bad += n ))
done
echo "total_bad (subshell): $total_bad"   # 0 — wrong!

# FIX: process substitution keeps while in current shell
total_good=0
while read -r n; do
    (( total_good += n ))
done < <(printf '10\n20\n30\n')
echo "total_good (current shell): $total_good"   # 60 — correct


# --- Parallel execution with & and wait ---

echo ""
echo "=== parallel jobs ==="

worker() {
    local id=$1
    local secs=$2
    sleep "$secs"
    echo "  worker $id done (slept ${secs}s)"
}

start=$(date +%s)
pids=()

worker 1 2 &; pids+=($!)
worker 2 1 &; pids+=($!)
worker 3 3 &; pids+=($!)

# Wait for all and collect exit codes
failed=0
for pid in "${pids[@]}"; do
    wait "$pid" || (( failed++ ))
done

end=$(date +%s)
echo "All workers done in $(( end - start ))s (would be 6s serial)"
(( failed == 0 )) && echo "All succeeded"


# --- xargs parallel: process files in parallel ---

echo ""
echo "=== xargs -P ==="

process_file() {
    local f=$1
    wc -l < "$f"
}
export -f process_file

# Process /etc/*.conf files in parallel (4 at a time)
find /etc -maxdepth 1 -name "*.conf" -print0 2>/dev/null \
    | xargs -0 -P 4 -I{} bash -c 'echo "$(wc -l < {}) {}"' \
    | sort -rn \
    | head -5


# --- Named pipe: two-process communication ---

echo ""
echo "=== named pipe ==="
fifo=$(mktemp -u)   # -u: just the name, don't create
mkfifo "$fifo"

# Producer in background
( for i in 1 2 3; do echo "message $i"; sleep 0.1; done ) > "$fifo" &

# Consumer reads from the pipe
while IFS= read -r line; do
    echo "  received: $line"
done < "$fifo"

wait
rm -f "$fifo"
```

## Why This Matters

Process substitution is what lets you use any command as a "file" for tools like `diff`, `comm`, `join`, and `paste` that require file arguments. Without it, you'd write temporary files, compare them, and clean up — three lines of boilerplate per use. With it, it's inline.

The subshell variable trap is one of the most common bugs in intermediate Bash scripts. Any non-trivial script that accumulates state (counts, arrays, flags) in a loop needs to avoid the pipeline-subshell trap. Process substitution is the clean fix.

## Exercise

Write a script that:

1. Takes a directory path as an argument.
2. In parallel (use `&` and `wait`), computes the MD5 checksum of every file in the directory (non-recursive).
3. Collects the results — `checksum  filename` — into an array (watch out for the subshell trap).
4. Sorts the results by filename and prints them.
5. Prints total file count and total size.

Use process substitution, `mapfile`, and parallel `&` jobs.

<details>
<summary>Hint</summary>
Launch each `md5sum file &` job and collect output into a temp file or use a named pipe. The subshell trap means you can't accumulate into an array directly from a `wait` loop if the work happens in subshells. One approach: redirect all checksum output to a temp file (one line per file), then `mapfile -t results < <(sort "$tmpfile")` to get a sorted array back in the main shell.
</details>

<details>
<summary>Solution</summary>

```bash
#!/usr/bin/env bash
set -euo pipefail

dir="${1:?Usage: $0 <directory>}"
[[ -d "$dir" ]] || { echo "Not a directory: $dir" >&2; exit 1; }

tmpout=$(mktemp)
trap 'rm -f "$tmpout"' EXIT

pids=()
total_size=0

while IFS= read -r -d '' file; do
    size=$(stat -c '%s' "$file")
    (( total_size += size ))
    ( md5sum "$file" >> "$tmpout" ) &
    pids+=($!)
done < <(find "$dir" -maxdepth 1 -type f -print0)

for pid in "${pids[@]}"; do
    wait "$pid"
done

mapfile -t results < <(sort -k2 "$tmpout")

echo "Checksums (sorted by filename):"
printf '%s\n' "${results[@]}"
echo ""
echo "Files: ${#results[@]}"
echo "Total size: $total_size bytes"
```

</details>
