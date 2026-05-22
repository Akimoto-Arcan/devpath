---
difficulty: intermediate
---

# RAII

RAII stands for **Resource Acquisition Is Initialization**. The principle: tie the lifetime of a resource to the lifetime of a C++ object. Acquire the resource in the constructor. Release it in the destructor. Since destructors run automatically when objects go out of scope — even when exceptions are thrown — you get guaranteed cleanup with no extra code.

"Resource" means anything that needs explicit release: heap memory, file handles, mutex locks, database connections, GPU buffers, sockets.

## Why Destructors Are the Right Hook

C++ guarantees that destructors run in reverse order of construction when:
- A local variable goes out of scope (normal return or exception).
- A member variable's owning object is destroyed.
- A `delete` is called on a heap object.

There is no equivalent guarantee in languages with `try`/`finally` — `finally` is opt-in, RAII is automatic. You can't forget to call it.

## RAII vs Other Approaches

- **Manual cleanup (`free`, `fclose`, `unlock`)**: requires every code path through the function to call cleanup. One `return` added later, one exception path missed, and you have a leak or deadlock.
- **`try`/`finally` (Java, Python)**: explicit per-resource, verbose, not composable.
- **Garbage collection**: handles memory but not other resources. A GC'd language still needs explicit file closing and lock releasing.

RAII composes: nest two RAII objects and both clean up in the right order, automatically.

## Example

```cpp
#include <iostream>
#include <fstream>
#include <stdexcept>
#include <string>
#include <mutex>

// --- A simple manual RAII wrapper ---
// Wraps a FILE* to demonstrate the pattern from scratch.

class FileHandle {
public:
    explicit FileHandle(const std::string& path, const char* mode) {
        file_ = std::fopen(path.c_str(), mode);
        if (!file_) {
            throw std::runtime_error("Cannot open file: " + path);
        }
        std::cout << "[FileHandle] opened " << path << '\n';
    }

    ~FileHandle() {
        if (file_) {
            std::fclose(file_);
            std::cout << "[FileHandle] closed\n";
        }
    }

    // Non-copyable: two handles to the same file is a bug
    FileHandle(const FileHandle&)            = delete;
    FileHandle& operator=(const FileHandle&) = delete;

    // Movable: transfer ownership
    FileHandle(FileHandle&& other) noexcept : file_(other.file_) {
        other.file_ = nullptr;
    }

    void write(const std::string& data) {
        std::fputs(data.c_str(), file_);
    }

    FILE* get() const { return file_; }

private:
    FILE* file_;
};

// --- RAII mutex lock guard (simplified version of std::lock_guard) ---

class LockGuard {
public:
    explicit LockGuard(std::mutex& m) : mutex_(m) {
        mutex_.lock();
        std::cout << "[LockGuard] locked\n";
    }

    ~LockGuard() {
        mutex_.unlock();
        std::cout << "[LockGuard] unlocked\n";
    }

    LockGuard(const LockGuard&)            = delete;
    LockGuard& operator=(const LockGuard&) = delete;

private:
    std::mutex& mutex_;
};

// --- RAII for a dynamically-allocated buffer ---

class Buffer {
public:
    explicit Buffer(std::size_t size) : size_(size), data_(new char[size]) {
        std::cout << "[Buffer] allocated " << size << " bytes\n";
    }

    ~Buffer() {
        delete[] data_;
        std::cout << "[Buffer] freed\n";
    }

    Buffer(const Buffer&)            = delete;
    Buffer& operator=(const Buffer&) = delete;

    char* data()             { return data_; }
    std::size_t size() const { return size_; }

private:
    std::size_t size_;
    char* data_;
};

// --- Demo: RAII cleanup through exception ---

void process_file(const std::string& path) {
    FileHandle f(path, "w");    // acquired here
    f.write("line 1\n");
    f.write("line 2\n");

    // Simulating an error mid-way through
    // Even if we throw here, ~FileHandle() still runs — the file is closed.
    // throw std::runtime_error("simulated error");

    f.write("line 3\n");
    // f destroyed here at end of scope — ~FileHandle() runs
}

void locked_operation(std::mutex& m) {
    LockGuard guard(m);    // locked here
    std::cout << "  doing work under lock\n";
    // even if exception here, ~LockGuard() runs and unlocks
}   // ~LockGuard() unlocks here

// --- Showing destruction order (reverse of construction) ---

struct Tracked {
    std::string name;
    explicit Tracked(const std::string& n) : name(n) {
        std::cout << "  [+] " << name << "\n";
    }
    ~Tracked() {
        std::cout << "  [-] " << name << "\n";
    }
};

int main() {
    std::cout << "=== File RAII ===\n";
    try {
        process_file("/tmp/raii_test.txt");
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << '\n';
    }

    std::cout << "\n=== Mutex RAII ===\n";
    std::mutex m;
    locked_operation(m);
    std::cout << "Back in main — mutex is unlocked\n";

    std::cout << "\n=== Buffer RAII ===\n";
    {
        Buffer buf(1024);
        buf.data()[0] = 'A';
        std::cout << "  first byte: " << buf.data()[0] << '\n';
    }   // ~Buffer() runs here — no delete[] needed in calling code
    std::cout << "After inner scope — buffer freed\n";

    std::cout << "\n=== Destruction order ===\n";
    {
        Tracked a("first");
        Tracked b("second");
        Tracked c("third");
    }   // c, b, a — reverse order
    // Output:
    //   [+] first
    //   [+] second
    //   [+] third
    //   [-] third
    //   [-] second
    //   [-] first

    return 0;
}
```

## Why This Matters

Every resource leak you've debugged — file handles left open, memory not freed, mutexes not released on error paths — is an RAII failure. Once you internalize the pattern, you stop writing explicit cleanup code and start writing wrappers. The wrappers are written once, reviewed once, and then used everywhere correctly by construction.

The standard library is built on it: `std::fstream` closes on destruction, `std::lock_guard` unlocks on destruction, `std::unique_ptr` deletes on destruction. You never call `fclose` or `unlock` or `delete` in modern C++; you just let objects go out of scope.

## Exercise

Write an RAII class `TempFile` that:

1. Creates a temporary file on construction (use a fixed path like `/tmp/tempfile_XXXXXX` via `mkstemp` or just `/tmp/devpath_temp.txt`).
2. Allows writing to it via a `write(const std::string&)` method.
3. Allows reading the full contents back via a `read_all()` method returning `std::string`.
4. **Deletes the file from disk** on destruction (use `std::remove`).

Verify it works: write some data, read it back, let the object go out of scope, and confirm the file no longer exists (try opening it manually or with another `std::ifstream`).

<details>
<summary>Hint</summary>
Use `std::fstream` (or `std::ofstream`/`std::ifstream`) internally — they are themselves RAII types, so your destructor only needs to call `std::remove(path_.c_str())`. For `read_all()`, seek to the beginning of the file, then use `std::istreambuf_iterator` or `std::getline` in a loop. Store the path as a `std::string` member so the destructor knows what to delete.
</details>

<details>
<summary>Solution</summary>

```cpp
#include <fstream>
#include <string>
#include <stdexcept>
#include <iterator>
#include <cstdio>
#include <iostream>

class TempFile {
public:
    explicit TempFile(const std::string& path = "/tmp/devpath_temp.txt")
        : path_(path), stream_(path, std::ios::in | std::ios::out
                                    | std::ios::trunc)
    {
        if (!stream_) throw std::runtime_error("Cannot create temp file: " + path);
        std::cout << "[TempFile] created: " << path_ << '\n';
    }

    ~TempFile() {
        stream_.close();
        std::remove(path_.c_str());
        std::cout << "[TempFile] deleted: " << path_ << '\n';
    }

    TempFile(const TempFile&)            = delete;
    TempFile& operator=(const TempFile&) = delete;

    void write(const std::string& data) {
        stream_ << data;
        stream_.flush();
    }

    std::string read_all() {
        stream_.seekg(0);
        return std::string(std::istreambuf_iterator<char>(stream_),
                           std::istreambuf_iterator<char>());
    }

private:
    std::string   path_;
    std::fstream  stream_;
};

int main() {
    {
        TempFile tf;
        tf.write("Hello, RAII!\n");
        tf.write("Second line.\n");
        std::cout << tf.read_all();
    }   // destructor runs: file deleted

    // Confirm deletion
    std::ifstream check("/tmp/devpath_temp.txt");
    std::cout << "File exists after scope: " << std::boolalpha
              << check.is_open() << '\n';  // false
    return 0;
}
```

</details>
