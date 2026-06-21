/*
 * restash-win-helper.exe — bundled, self-contained Win32 helper for Restash.
 *
 * Zero-install policy: this is a committed/CI-built tiny native exe (mirrors the
 * macOS bin/restash-* Swift pattern). It is shipped in extraResources OUTSIDE
 * asar. It depends on nothing the user installs — only Win32 system DLLs that
 * exist on every Windows 10/11 machine (user32, shell32, ole32).
 *
 * Modes:
 *   --get-foreground          Print the foreground HWND (decimal) to stdout.
 *   --paste [hwnd]            SetForegroundWindow(hwnd) with the AttachThreadInput
 *                             foreground-lock workaround, then SendInput Ctrl+V.
 *   --clip-files <paths...>   Build a CF_HDROP/DROPFILES list on the clipboard
 *                             so one Ctrl+V attaches all files in Explorer/Outlook.
 *   --list                    EnumWindows → JSON array [{"owner":..,"title":..}].
 *
 * Build (MSVC):
 *   cl /O2 /MT restash-win-helper.c /Fe:restash-win-helper.exe \
 *      user32.lib shell32.lib ole32.lib
 * Build (MinGW cross from CI):
 *   x86_64-w64-mingw32-gcc -O2 -o restash-win-helper.exe restash-win-helper.c \
 *      -luser32 -lshell32 -lole32 -mwindows -municode  (console subsystem; see below)
 *
 * No elevation required. KNOWN LIMITATION: SendInput cannot target processes
 * running elevated/as admin when Restash is not elevated (documented).
 */

#ifndef UNICODE
#define UNICODE
#endif
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shlobj.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>

/* ---- Ctrl+V synthesis ---------------------------------------------------- */
static void send_ctrl_v(void) {
    INPUT in[4];
    ZeroMemory(in, sizeof(in));

    in[0].type = INPUT_KEYBOARD; in[0].ki.wVk = VK_CONTROL;
    in[1].type = INPUT_KEYBOARD; in[1].ki.wVk = 'V';
    in[2].type = INPUT_KEYBOARD; in[2].ki.wVk = 'V'; in[2].ki.dwFlags = KEYEVENTF_KEYUP;
    in[3].type = INPUT_KEYBOARD; in[3].ki.wVk = VK_CONTROL; in[3].ki.dwFlags = KEYEVENTF_KEYUP;

    SendInput(4, in, sizeof(INPUT));
}

/* Bring `target` to the foreground, working around the Win foreground lock by
 * attaching our input thread to the target's. */
static void force_foreground(HWND target) {
    if (!target || !IsWindow(target)) return;

    HWND   fg     = GetForegroundWindow();
    DWORD  fgTid  = fg ? GetWindowThreadProcessId(fg, NULL) : 0;
    DWORD  tgtTid = GetWindowThreadProcessId(target, NULL);
    DWORD  ourTid = GetCurrentThreadId();

    if (fgTid && fgTid != ourTid)  AttachThreadInput(ourTid, fgTid, TRUE);
    if (tgtTid && tgtTid != ourTid) AttachThreadInput(ourTid, tgtTid, TRUE);

    AllowSetForegroundWindow(ASFW_ANY);
    ShowWindow(target, SW_SHOW);
    SetForegroundWindow(target);
    SetActiveWindow(target);
    BringWindowToTop(target);

    if (fgTid && fgTid != ourTid)  AttachThreadInput(ourTid, fgTid, FALSE);
    if (tgtTid && tgtTid != ourTid) AttachThreadInput(ourTid, tgtTid, FALSE);
}

static int do_paste(HWND target) {
    if (target) {
        force_foreground(target);
        Sleep(60); /* let focus settle */
    }
    send_ctrl_v();
    return 0;
}

/* ---- CF_HDROP multi-file clipboard write --------------------------------- */
static int do_clip_files(int count, wchar_t **paths) {
    if (count <= 0) return 2;

    /* Compute the double-null-terminated path buffer size. */
    size_t total = 0;
    for (int i = 0; i < count; i++) total += (wcslen(paths[i]) + 1);
    total += 1; /* extra terminating null */

    size_t bytes = sizeof(DROPFILES) + total * sizeof(wchar_t);
    HGLOBAL hg = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes);
    if (!hg) return 3;

    DROPFILES *df = (DROPFILES *)GlobalLock(hg);
    df->pFiles = sizeof(DROPFILES);
    df->fWide  = TRUE;
    wchar_t *p = (wchar_t *)((BYTE *)df + sizeof(DROPFILES));
    for (int i = 0; i < count; i++) {
        size_t n = wcslen(paths[i]) + 1;
        memcpy(p, paths[i], n * sizeof(wchar_t));
        p += n;
    }
    *p = L'\0';
    GlobalUnlock(hg);

    if (!OpenClipboard(NULL)) { GlobalFree(hg); return 4; }
    EmptyClipboard();
    if (!SetClipboardData(CF_HDROP, hg)) { CloseClipboard(); GlobalFree(hg); return 5; }
    CloseClipboard();
    /* Ownership of hg transferred to the clipboard. */
    return 0;
}

/* ---- EnumWindows JSON listing -------------------------------------------- */
static void json_escape_print(const char *s) {
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        if (c == '"' || c == '\\') { putchar('\\'); putchar(c); }
        else if (c == '\n') fputs("\\n", stdout);
        else if (c == '\r') {}
        else if (c == '\t') fputs("\\t", stdout);
        else if (c < 0x20) printf("\\u%04x", c);
        else putchar(c);
    }
}

static int g_first = 1;

static BOOL CALLBACK enum_cb(HWND hwnd, LPARAM lparam) {
    (void)lparam;
    if (!IsWindowVisible(hwnd)) return TRUE;
    if (GetWindow(hwnd, GW_OWNER) != NULL) return TRUE; /* skip owned popups */

    int len = GetWindowTextLengthW(hwnd);
    if (len <= 0) return TRUE;

    wchar_t wtitle[512];
    GetWindowTextW(hwnd, wtitle, 512);

    /* Owner = process image base name. */
    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    wchar_t wowner[260] = L"";
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (h) {
        DWORD sz = 260;
        QueryFullProcessImageNameW(h, 0, wowner, &sz);
        CloseHandle(h);
        /* strip directory → base name */
        wchar_t *bs = wcsrchr(wowner, L'\\');
        if (bs) memmove(wowner, bs + 1, (wcslen(bs + 1) + 1) * sizeof(wchar_t));
    }

    char title[1024], owner[520];
    WideCharToMultiByte(CP_UTF8, 0, wtitle, -1, title, sizeof(title), NULL, NULL);
    WideCharToMultiByte(CP_UTF8, 0, wowner, -1, owner, sizeof(owner), NULL, NULL);

    if (!g_first) putchar(',');
    g_first = 0;
    fputs("{\"owner\":\"", stdout); json_escape_print(owner);
    fputs("\",\"title\":\"", stdout); json_escape_print(title);
    fputs("\"}", stdout);
    return TRUE;
}

static int do_list(void) {
    putchar('[');
    EnumWindows(enum_cb, 0);
    putchar(']');
    return 0;
}

int wmain(int argc, wchar_t **argv) {
    if (argc < 2) { fwprintf(stderr, L"usage: restash-win-helper --get-foreground|--paste [hwnd]|--clip-files <paths...>|--list\n"); return 1; }

    if (wcscmp(argv[1], L"--get-foreground") == 0) {
        HWND fg = GetForegroundWindow();
        printf("%lld\n", (long long)(INT_PTR)fg);
        return 0;
    }
    if (wcscmp(argv[1], L"--paste") == 0) {
        HWND target = NULL;
        if (argc >= 3) target = (HWND)(INT_PTR)_wtoi64(argv[2]);
        return do_paste(target);
    }
    if (wcscmp(argv[1], L"--clip-files") == 0) {
        return do_clip_files(argc - 2, argv + 2);
    }
    if (wcscmp(argv[1], L"--list") == 0) {
        return do_list();
    }
    fwprintf(stderr, L"unknown mode: %ls\n", argv[1]);
    return 1;
}
