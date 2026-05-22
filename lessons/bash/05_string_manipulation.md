---
difficulty: intermediate
---

# String Manipulation

Bash has a surprisingly capable set of built-in string operations via **parameter expansion**. Using them instead of forking `sed`, `awk`, or `cut` for every string operation makes scripts faster (no subprocess overhead) and more portable. Knowing when the built-ins are sufficient — and when `sed`/`awk` is genuinely the right tool — is the key skill.

## Parameter Expansion Reference

### Defaults and Errors

| Syntax | Meaning |
|--------|---------|
| `${var:-default}` | Use `default` if `var` is unset or empty |
| `${var:=default}` | Assign and use `default` if `var` is unset or empty |
| `${var:+other}` | Use `other` if `var` is set and non-empty; otherwise empty string |
| `${var:?message}` | Error and exit if `var` is unset or empty |

### Substrings

| Syntax | Meaning |
|--------|---------|
| `${var:offset}` | From offset to end |
| `${var:offset:length}` | Substring of `length` characters starting at `offset` |
| `${#var}` | Length of string |

### Prefix/Suffix Removal

| Syntax | Meaning |
|--------|---------|
| `${var#pattern}` | Remove shortest match of `pattern` from the **start** |
| `${var##pattern}` | Remove longest match of `pattern` from the **start** |
| `${var%pattern}` | Remove shortest match of `pattern` from the **end** |
| `${var%%pattern}` | Remove longest match of `pattern` from the **end** |

Patterns use glob syntax (`*`, `?`, `[...]`), not regex.

### Substitution and Case

| Syntax | Meaning |
|--------|---------|
| `${var/find/replace}` | Replace first match |
| `${var//find/replace}` | Replace all matches |
| `${var/#find/replace}` | Replace if match is at start |
| `${var/%find/replace}` | Replace if match is at end |
| `${var^^}` | Uppercase all (Bash 4+) |
| `${var,,}` | Lowercase all (Bash 4+) |
| `${var^}` | Uppercase first character |
| `${var,}` | Lowercase first character |

## Regex Matching with `=~`

The `[[ str =~ regex ]]` operator matches POSIX extended regex. On match, `${BASH_REMATCH[0]}` holds the full match, `${BASH_REMATCH[1]}` the first capture group, etc.

```bash
if [[ "2026-05-20" =~ ^([0-9]{4})-([0-9]{2})-([0-9]{2})$ ]]; then
    year="${BASH_REMATCH[1]}"
    month="${BASH_REMATCH[2]}"
fi
```

## When to Use `sed`/`awk` Instead

Use parameter expansion when:
- The operation is a simple prefix/suffix strip, substitution, or case change.
- You're operating on a single string variable.
- You need it to be fast (inside a tight loop).

Reach for `sed`/`awk` when:
- You're processing a stream of lines (file or pipe).
- You need backreferences, lookaheads, or multi-line matching.
- The pattern is complex enough that the parameter expansion becomes unreadable.
- You're extracting fields by position or delimiter from many records.

## Example

```bash
#!/usr/bin/env bash
set -euo pipefail

# --- Prefix/suffix removal: path manipulation ---

filepath="/var/log/nginx/access.log.gz"

filename="${filepath##*/}"          # access.log.gz   (remove longest */ prefix)
directory="${filepath%/*}"          # /var/log/nginx  (remove shortest /* suffix)
basename_noext="${filename%.gz}"    # access.log      (remove .gz suffix)
extension="${filename##*.}"         # gz              (remove longest *. prefix)

echo "Full path:  $filepath"
echo "Filename:   $filename"
echo "Directory:  $directory"
echo "No ext:     $basename_noext"
echo "Extension:  $extension"


# --- Substring operations ---

version="v2.14.3-rc1"

# Strip leading 'v'
ver_num="${version#v}"              # 2.14.3-rc1

# Extract major.minor.patch (before the dash)
ver_clean="${ver_num%%-*}"          # 2.14.3

# Split on dots: extract each component
major="${ver_clean%%.*}"            # 2
rest="${ver_clean#*.}"              # 14.3
minor="${rest%%.*}"                 # 14
patch="${rest#*.}"                  # 3

echo ""
echo "Version: $version"
printf "major=%s minor=%s patch=%s\n" "$major" "$minor" "$patch"

# Length and position
echo "Length: ${#version}"          # 12
echo "Substr [1:4]: ${version:1:4}" # 2.14  (skip the 'v')


# --- Substitution ---

sentence="the cat sat on the mat"

# Replace first occurrence
echo "${sentence/the/a}"           # a cat sat on the mat

# Replace all
echo "${sentence//the/a}"          # a cat sat on a mat

# Replace spaces with underscores
slug="${sentence// /_}"
echo "$slug"                       # the_cat_sat_on_the_mat


# --- Case conversion ---

input="Hello World FOO bar"
echo "${input^^}"                  # HELLO WORLD FOO BAR
echo "${input,,}"                  # hello world foo bar
echo "${input^}"                   # Hello world FOO bar  (only first char)

# Capitalize each word (no built-in — use awk or a loop)
capitalize_words() {
    local result=""
    for word in $1; do             # intentional word splitting
        result+="${word^} "
    done
    echo "${result% }"             # trim trailing space
}
echo "$(capitalize_words "hello world foo")"   # Hello World Foo


# --- Default values in practice ---

# Configuration with defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
LOG_LEVEL="${LOG_LEVEL:-INFO}"
APP_NAME="${APP_NAME:?APP_NAME must be set}"   # fatal if missing

printf "DB: %s:%s | Log: %s | App: %s\n" \
    "$DB_HOST" "$DB_PORT" "$LOG_LEVEL" "$APP_NAME"


# --- Regex matching for input validation ---

validate_ip() {
    local ip="$1"
    local octet='(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)'
    local pattern="^${octet}\.${octet}\.${octet}\.${octet}$"
    [[ "$ip" =~ $pattern ]]
}

validate_date() {
    local d="$1"
    if [[ "$d" =~ ^([0-9]{4})-([0-9]{2})-([0-9]{2})$ ]]; then
        echo "year=${BASH_REMATCH[1]} month=${BASH_REMATCH[2]} day=${BASH_REMATCH[3]}"
        return 0
    fi
    return 1
}

echo ""
for ip in "192.168.1.1" "256.0.0.1" "10.0.0" "172.16.254.1"; do
    if validate_ip "$ip"; then
        echo "valid IP:   $ip"
    else
        echo "invalid IP: $ip"
    fi
done

echo ""
validate_date "2026-05-20" && echo "valid date"
validate_date "not-a-date" || echo "invalid date"


# --- When sed is right: stream processing ---

# Transforming a config file: replace all 'localhost' with a hostname
# Pure bash can't process a file line by line efficiently with parameter expansion
# sed is the right tool here:
echo ""
echo "=== sed for stream processing ==="
printf 'host=localhost\nport=5432\nreplica=localhost\n' \
    | sed 's/localhost/db.internal/g'


# --- When awk is right: field extraction ---

echo ""
echo "=== awk for field extraction ==="
printf 'alice:1001:100:Alice Smith:/home/alice:/bin/bash\n
bob:1002:100:Bob Jones:/home/bob:/bin/bash\n' \
    | awk -F: '$3 == 100 { printf "%-10s uid=%s home=%s\n", $1, $2, $6 }'


# --- Practical: parse a key=value config file into variables ---

parse_config() {
    local file="$1"
    local -n _out=$2   # nameref to caller's associative array

    while IFS='=' read -r key value; do
        # Strip comments and blank lines
        [[ "$key" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${key// }" ]] && continue
        # Trim whitespace
        key="${key#"${key%%[![:space:]]*}"}"
        key="${key%"${key##*[![:space:]]}"}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        [[ -n "$key" ]] && _out["$key"]="$value"
    done < "$file"
}

tmpconf=$(mktemp)
cat > "$tmpconf" <<EOF
# App config
host = db.internal
port = 5432
name = production
EOF

declare -A cfg
parse_config "$tmpconf" cfg
rm -f "$tmpconf"

echo ""
echo "Parsed config:"
for k in "${!cfg[@]}"; do
    printf "  %-10s = %s\n" "$k" "${cfg[$k]}"
done
```

## Why This Matters

Every `echo "$var" | sed 's/foo/bar/'` forks a process. In a loop over a thousand items, that's a thousand `sed` processes. `${var//foo/bar}` is pure shell — zero forks. For path manipulation (`##*/`, `%/*`), the built-in forms are faster and require no external tools, which matters in containers and minimal environments where `sed` might not even be available.

Understanding regex matching with `=~` and `BASH_REMATCH` also lets you write input validation inline, without forking `grep` for every check. For a web-facing script that validates user input, this is both faster and less code.

## Exercise

Write a function `parse_dsn` that takes a database connection string in this format:

```
postgresql://user:password@host:port/dbname?option1=val1&option2=val2
```

And extracts each component into a nameref'd associative array. The function should handle missing ports (default 5432) and missing query string.

Test with:
```
postgresql://admin:s3cret@db.internal:5433/myapp?sslmode=require&connect_timeout=10
postgresql://reader@replica.internal/reports
```

Use only parameter expansion — no `sed`, `awk`, or `cut`.

<details>
<summary>Hint</summary>
Strip the scheme with `${dsn#*://}`. Extract user:pass with `${rest%%@*}`, then host:port/db with `${rest#*@}`. For the query string, split on `?`. For user vs password, split on `:`. For host vs port, split on `:` but only the last one before `/`. Use `${var:-5432}` for the port default. For the query string options, loop: `while [[ "$qs" == *=* ]]` extracting `key=${qs%%=*}` and stripping with `${qs#*&}`.
</details>

<details>
<summary>Solution</summary>

```bash
#!/usr/bin/env bash

parse_dsn() {
    local dsn="$1"
    local -n _result=$2

    # Strip scheme
    local rest="${dsn#*://}"

    # Extract query string
    local qs=""
    if [[ "$rest" == *'?'* ]]; then
        qs="${rest#*\?}"
        rest="${rest%%\?*}"
    fi

    # Extract user:pass@host
    local userinfo=""
    if [[ "$rest" == *'@'* ]]; then
        userinfo="${rest%%@*}"
        rest="${rest#*@}"
    fi

    # Extract user and password
    _result[user]="${userinfo%%:*}"
    if [[ "$userinfo" == *':'* ]]; then
        _result[password]="${userinfo#*:}"
    else
        _result[password]=""
    fi

    # Extract host:port/dbname
    local hostpart="${rest%%/*}"
    _result[dbname]="${rest#*/}"

    if [[ "$hostpart" == *':'* ]]; then
        _result[host]="${hostpart%%:*}"
        _result[port]="${hostpart#*:}"
    else
        _result[host]="$hostpart"
        _result[port]="5432"
    fi

    # Parse query string options
    while [[ -n "$qs" ]]; do
        local pair="${qs%%&*}"
        local opt_key="${pair%%=*}"
        local opt_val="${pair#*=}"
        _result["opt_$opt_key"]="$opt_val"
        if [[ "$qs" == *'&'* ]]; then
            qs="${qs#*&}"
        else
            qs=""
        fi
    done
}

print_dsn() {
    local dsn="$1"
    declare -A parts
    parse_dsn "$dsn" parts

    echo "DSN: $dsn"
    printf "  user=%-12s pass=%-10s host=%-20s port=%s db=%s\n" \
        "${parts[user]}" "${parts[password]}" \
        "${parts[host]}" "${parts[port]}" "${parts[dbname]}"

    for k in "${!parts[@]}"; do
        [[ "$k" == opt_* ]] && printf "  option: %s = %s\n" "${k#opt_}" "${parts[$k]}"
    done
    echo ""
}

print_dsn "postgresql://admin:s3cret@db.internal:5433/myapp?sslmode=require&connect_timeout=10"
print_dsn "postgresql://reader@replica.internal/reports"
```

</details>
