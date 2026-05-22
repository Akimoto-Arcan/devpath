---
difficulty: intermediate
---

# Arrays and Associative Arrays

Bash arrays are often avoided because the syntax is unusual compared to other languages. That's a mistake — they're the right tool for holding lists of values without resorting to word-splitting hacks or delimiter-separated strings (which break on spaces and special characters).

## Indexed Arrays

Indexed arrays use integers as keys. They don't need to be contiguous — index 0, 5, 100 can coexist.

```bash
# Three ways to declare
arr=(one two three)             # literal initialization
arr[0]="one"                    # individual assignment
declare -a arr                  # explicit declaration (usually unnecessary)
```

Key syntax:
- `${arr[2]}` — element at index 2
- `${arr[@]}` — all elements (as separate words — use this, not `*`)
- `${arr[*]}` — all elements (as single word when quoted — rare)
- `${#arr[@]}` — number of elements
- `${!arr[@]}` — all indices (useful for sparse arrays)
- `arr+=(four five)` — append elements
- `unset arr[2]` — delete element (leaves a gap — array stays sparse)

## Associative Arrays

Associative arrays (`declare -A`) use string keys. Unlike indexed arrays, they must be explicitly declared.

```bash
declare -A map
map[key]="value"
map=([host]="localhost" [port]="5432")
```

- `${map[key]}` — value for key
- `${!map[@]}` — all keys
- `${map[@]}` — all values
- Iteration order is not guaranteed (hash table internally)

## `mapfile` / `readarray`

`mapfile` (alias `readarray`) reads lines from stdin or a file into an indexed array. Far cleaner than a `while read` loop when you need random access later.

```bash
mapfile -t lines < /etc/hosts       # -t strips trailing newlines
mapfile -t words < <(command)       # process substitution as input
```

## Passing Arrays to Functions

You **cannot** pass arrays directly. Options:
1. **Pass the name, use `nameref`** — cleanest approach (Bash 4.3+).
2. **Serialize to `"${arr[@]}"`** — works but loses structure if elements contain spaces... wait, no: `"${arr[@]}"` correctly quotes each element. Reassemble inside with `local -a copy=("$@")`.
3. **Use a global** — pragmatic for small scripts.

## Example

```bash
#!/usr/bin/env bash

# --- Indexed array basics ---

fruits=(apple banana cherry "dragon fruit" elderberry)

echo "Count: ${#fruits[@]}"          # 5
echo "Index 3: ${fruits[3]}"         # dragon fruit
echo "All: ${fruits[@]}"             # apple banana cherry dragon fruit elderberry

# Iterate safely (handles spaces in elements)
for fruit in "${fruits[@]}"; do
    echo "  - $fruit"
done

# Slice: elements 1 through 3
echo "Slice: ${fruits[@]:1:3}"       # banana cherry dragon fruit

# Append
fruits+=(fig grape)
echo "After append: ${#fruits[@]}"  # 7

# Delete and check for sparse gap
unset fruits[2]
echo "After unset [2]: ${#fruits[@]}"  # 6 (cherry gone)
echo "Indices: ${!fruits[@]}"           # 0 1 3 4 5 6

# Iterating with indices (safe for sparse arrays)
for i in "${!fruits[@]}"; do
    printf "  [%d] = %s\n" "$i" "${fruits[i]}"
done


# --- Associative array ---

declare -A config
config[host]="db.internal"
config[port]="5432"
config[user]="appuser"
config[name]="production"

echo ""
echo "DB: ${config[user]}@${config[host]}:${config[port]}/${config[name]}"

# Iterate keys and values
echo "Config:"
for key in "${!config[@]}"; do
    printf "  %-10s = %s\n" "$key" "${config[$key]}"
done

# Check if key exists
if [[ -v config[port] ]]; then
    echo "Port is set: ${config[port]}"
fi

# Delete a key
unset config[user]
echo "Keys after unset: ${!config[@]}"


# --- mapfile ---

echo ""
echo "Reading /etc/os-release into array:"
mapfile -t os_lines < /etc/os-release

echo "Line count: ${#os_lines[@]}"
echo "First line: ${os_lines[0]}"

# mapfile with process substitution: command output to array
mapfile -t top_users < <(awk -F: '$3 >= 1000 {print $1}' /etc/passwd)
echo "Regular users (UID >= 1000): ${#top_users[@]}"
for u in "${top_users[@]}"; do
    echo "  $u"
done


# --- Passing arrays to functions using nameref ---

# Function that modifies an array by name
filter_gt() {
    local -n _arr=$1      # nameref: _arr is an alias for the caller's array
    local threshold=$2
    local -a result=()

    for val in "${_arr[@]}"; do
        if (( val > threshold )); then
            result+=("$val")
        fi
    done

    # Write back via nameref (modifies the caller's array)
    _arr=("${result[@]}")
}

numbers=(3 17 8 42 1 99 25 6)
echo ""
echo "Before filter: ${numbers[*]}"
filter_gt numbers 10
echo "After filter >10: ${numbers[*]}"   # 17 42 99 25


# --- Pattern: build an array from command output, then process ---

echo ""
declare -A file_sizes
while IFS= read -r -d '' file; do
    size=$(stat -c '%s' "$file" 2>/dev/null || echo 0)
    file_sizes["$file"]=$size
done < <(find /etc -maxdepth 1 -name "*.conf" -print0 2>/dev/null)

echo "Config files in /etc:"
total=0
for f in "${!file_sizes[@]}"; do
    printf "  %-40s %d bytes\n" "$(basename "$f")" "${file_sizes[$f]}"
    (( total += file_sizes[$f] ))
done
echo "Total: $total bytes"
```

## Why This Matters

Avoiding arrays leads to shell scripts that split on whitespace, break on filenames with spaces, and use grep pipelines where a simple array membership check would do. Once you know arrays well, patterns like "collect a list of paths, deduplicate, iterate" become clean and fast instead of pipe-heavy and fragile.

Associative arrays replace the common pattern of grepping a key=value config file repeatedly — load it once into a `declare -A`, then look up keys instantly in the rest of the script.

## Exercise

Write a script that:

1. Reads all `.sh` files in a target directory (use `mapfile` with a glob or `find`).
2. For each file, counts the number of lines using `wc -l`.
3. Stores results in an associative array: `filename -> line count`.
4. Prints a sorted-by-line-count report (largest first).
5. Prints total line count at the end.

The sort should work even if filenames have spaces.

<details>
<summary>Hint</summary>
Use `mapfile -t files < <(find "$dir" -name "*.sh")` to collect paths. Then iterate with a `for` loop to populate your associative array. For sorting, you'll need to use a workaround: build a plain indexed array of `"count:filename"` strings, sort them with `sort -rn`, then split on `:` to print. Or use `printf '%s\n' "${!sizes[@]}"` piped to a sort+while loop.
</details>

<details>
<summary>Solution</summary>

```bash
#!/usr/bin/env bash
set -euo pipefail

target="${1:-.}"

declare -A line_counts
declare -a files

mapfile -t files < <(find "$target" -maxdepth 2 -name "*.sh" 2>/dev/null | sort)

if [[ ${#files[@]} -eq 0 ]]; then
    echo "No .sh files found in $target"
    exit 0
fi

for f in "${files[@]}"; do
    count=$(wc -l < "$f")
    line_counts["$f"]=$count
done

# Sort by line count descending: build sortable strings, sort, split
echo "Shell scripts by line count (largest first):"
echo "---"

total=0
while IFS= read -r entry; do
    count="${entry%%:*}"
    path="${entry#*:}"
    printf "%6d  %s\n" "$count" "$(basename "$path")"
    (( total += count ))
done < <(
    for f in "${!line_counts[@]}"; do
        printf '%d:%s\n' "${line_counts[$f]}" "$f"
    done | sort -rn -t: -k1
)

echo "---"
printf "%6d  total\n" "$total"
```

</details>
