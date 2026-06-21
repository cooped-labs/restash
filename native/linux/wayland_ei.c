/*
 * wayland_ei.c — Wayland paste (Ctrl+V) via libei + libportal RemoteDesktop.
 *
 * Provides the symbol declared in restash-linux-helper.c:
 *     int restash_libei_ctrl_v(void);
 *
 * Compiled and linked into restash-linux-helper ONLY when -DHAVE_LIBEI is set
 * (driven by `pkg-config --exists libei-1.0 libportal` in build-linux-helper.sh).
 * When this lane is unavailable, the helper falls back to /dev/uinput, which
 * is the documented one-time OS permission path.
 *
 * Zero-install: libportal and libei .so files (plus their transitive deps) are
 * copied into vendor/linux-lib by scripts/bundle-linux-libs.sh and bundled
 * inside the AppImage. RPATH ($ORIGIN/../lib) + LD_LIBRARY_PATH from
 * platform/linux.js resolve them from the bundled copy, never the host.
 *
 * Persistence (consent re-prompt avoidance):
 *   The portal's restore_token is written to
 *   $XDG_CONFIG_HOME/restash/wayland-portal-token (or ~/.config/restash/...) so
 *   the compositor's one-time consent dialog is NOT shown again on the next run.
 *   This needs libportal's persist-mode variant
 *   xdp_portal_create_remote_desktop_session_full(), which only exists in
 *   libportal >= 0.8. On older libportal (e.g. 0.7.1, shipped on the current
 *   ubuntu-latest CI runner) that symbol is ABSENT, so the build gates the
 *   persist path behind -DHAVE_PORTAL_PERSIST (set by build-linux-helper.sh when
 *   `pkg-config --atleast-version=0.8 libportal` succeeds). Without it we use the
 *   base xdp_portal_create_remote_desktop_session() and the consent dialog
 *   re-prompts each launch — still zero-install (a PERMISSION, not a download).
 *
 * Return value contract (matches the extern in restash-linux-helper.c):
 *   0  — Ctrl+V successfully injected via libei
 *   !0 — any failure; caller will fall through to the uinput path
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <time.h>
#include <poll.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <linux/input-event-codes.h>

#include <libportal/portal.h>
#include <libei.h>

/* ---- restore-token persistence ------------------------------------------
 * Only compiled when libportal >= 0.8 exposes the persist-mode session API
 * (xdp_portal_create_remote_desktop_session_full). See header note above. */
#ifdef HAVE_PORTAL_PERSIST

/* Build the on-disk path for the portal restore token. Returns malloc'd. */
static char *token_path(void) {
    const char *xdg = getenv("XDG_CONFIG_HOME");
    const char *home = getenv("HOME");
    char dir[1024];
    if (xdg && *xdg) snprintf(dir, sizeof(dir), "%s/restash", xdg);
    else if (home && *home) snprintf(dir, sizeof(dir), "%s/.config/restash", home);
    else return NULL;
    /* mkdir -p (best-effort) */
    mkdir(dir, 0700);
    char *out = NULL;
    if (asprintf(&out, "%s/wayland-portal-token", dir) < 0) return NULL;
    return out;
}

static char *load_token(void) {
    char *p = token_path();
    if (!p) return NULL;
    FILE *f = fopen(p, "r");
    free(p);
    if (!f) return NULL;
    char buf[4096];
    size_t n = fread(buf, 1, sizeof(buf) - 1, f);
    fclose(f);
    if (!n) return NULL;
    buf[n] = '\0';
    /* trim trailing newline */
    while (n > 0 && (buf[n - 1] == '\n' || buf[n - 1] == '\r')) buf[--n] = '\0';
    return n ? strdup(buf) : NULL;
}

static void save_token(const char *tok) {
    if (!tok || !*tok) return;
    char *p = token_path();
    if (!p) return;
    FILE *f = fopen(p, "w");
    if (f) {
        fputs(tok, f);
        fputc('\n', f);
        fclose(f);
        chmod(p, 0600);
    }
    free(p);
}

#endif /* HAVE_PORTAL_PERSIST */

/* ---- async portal plumbing ---------------------------------------------- */

typedef struct {
    GMainLoop  *loop;
    XdpPortal  *portal;
    XdpSession *session;
    char       *restore_in;   /* may be NULL on first run / when persist absent */
    int         eis_fd;       /* -1 until obtained */
    int         err_code;     /* 0 == ok */
} ctx_t;

static void on_session_started(GObject *src, GAsyncResult *res, gpointer ud) {
    ctx_t *c = (ctx_t *)ud;
    GError *err = NULL;
    (void)src;

    if (!xdp_session_start_finish(c->session, res, &err)) {
        fprintf(stderr, "[wayland_ei] xdp_session_start: %s\n", err ? err->message : "(unknown)");
        if (err) g_error_free(err);
        c->err_code = 5;
        g_main_loop_quit(c->loop);
        return;
    }

#ifdef HAVE_PORTAL_PERSIST
    /* Save the (possibly refreshed) restore token for next time. The token is a
     * newly-allocated, caller-owned string (xdp_session_get_restore_token
     * returns char*, NOT const char*), so free it after persisting. */
    char *tok = xdp_session_get_restore_token(c->session);
    if (tok && *tok) save_token(tok);
    g_free(tok);
#endif

    c->eis_fd = xdp_session_connect_to_eis(c->session, &err);
    if (c->eis_fd < 0) {
        fprintf(stderr, "[wayland_ei] connect_to_eis: %s\n", err ? err->message : "(unknown)");
        if (err) g_error_free(err);
        c->err_code = 6;
    }
    g_main_loop_quit(c->loop);
}

static void on_session_created(GObject *src, GAsyncResult *res, gpointer ud) {
    ctx_t *c = (ctx_t *)ud;
    GError *err = NULL;
    (void)src;

    c->session = xdp_portal_create_remote_desktop_session_finish(c->portal, res, &err);
    if (!c->session) {
        fprintf(stderr, "[wayland_ei] create_remote_desktop_session: %s\n",
                err ? err->message : "(unknown)");
        if (err) g_error_free(err);
        c->err_code = 4;
        g_main_loop_quit(c->loop);
        return;
    }
    xdp_session_start(c->session, NULL, NULL, on_session_started, c);
}

/* ---- libei: send Ctrl+V over the EIS fd --------------------------------- */

/* Pump libei events until a keyboard device is bound and resumed.
 * Returns the (ref'd) keyboard device, or NULL on timeout/error. */
static struct ei_device *await_keyboard(struct ei *ei, int timeout_ms) {
    struct ei_device *kbd = NULL;
    int resumed = 0;
    int eifd = ei_get_fd(ei);
    struct timespec start, now;
    clock_gettime(CLOCK_MONOTONIC, &start);

    while (!resumed) {
        clock_gettime(CLOCK_MONOTONIC, &now);
        long elapsed_ms = (now.tv_sec - start.tv_sec) * 1000
                        + (now.tv_nsec - start.tv_nsec) / 1000000;
        if (elapsed_ms > timeout_ms) break;

        struct pollfd p = { eifd, POLLIN, 0 };
        poll(&p, 1, 100);
        ei_dispatch(ei);

        struct ei_event *e;
        while ((e = ei_get_event(ei))) {
            switch (ei_event_get_type(e)) {
                case EI_EVENT_CONNECT:
                    break;
                case EI_EVENT_SEAT_ADDED: {
                    /* The libei C API takes enum ei_device_capability values
                     * (EI_DEVICE_CAP_*), NOT the wire interface-name strings.
                     * Variadic list is sentinel(NULL)-terminated; keyboard only. */
                    struct ei_seat *s = ei_event_get_seat(e);
                    if (s) ei_seat_bind_capabilities(s, EI_DEVICE_CAP_KEYBOARD, NULL);
                    break;
                }
                case EI_EVENT_DEVICE_ADDED: {
                    struct ei_device *d = ei_event_get_device(e);
                    if (d && !kbd && ei_device_has_capability(d, EI_DEVICE_CAP_KEYBOARD)) {
                        kbd = ei_device_ref(d);
                    }
                    break;
                }
                case EI_EVENT_DEVICE_RESUMED:
                    if (kbd && ei_event_get_device(e) == kbd) resumed = 1;
                    break;
                case EI_EVENT_DEVICE_PAUSED:
                    /* Server temporarily paused us — keep waiting for a resume. */
                    break;
                case EI_EVENT_DISCONNECT:
                    ei_event_unref(e);
                    if (kbd) { ei_device_unref(kbd); kbd = NULL; }
                    return NULL;
                default:
                    break;
            }
            ei_event_unref(e);
        }
    }
    if (!resumed && kbd) { ei_device_unref(kbd); return NULL; }
    return kbd;
}

static uint64_t monotonic_us(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000000ULL + (uint64_t)ts.tv_nsec / 1000ULL;
}

static int ei_send_ctrl_v(int fd) {
    struct ei *ei = ei_new_sender(NULL);
    if (!ei) return 10;
    if (ei_setup_backend_fd(ei, fd) != 0) { ei_unref(ei); return 11; }

    struct ei_device *kbd = await_keyboard(ei, 2500);
    if (!kbd) { ei_unref(ei); return 12; }

    /* libei REQUIRES the emulation transaction to be opened before any input
     * events: ei_device_start_emulating() ... events ... ei_device_stop_emulating().
     * Emitting key events outside this bracket is a client bug and the EIS
     * server will not deliver them. `sequence` is a per-device counter that must
     * strictly increase across transactions; we only do one transaction here.
     * Keycodes are evdev scan codes (linux/input-event-codes.h) — NOT XKB
     * keycodes, so no +8 offset: KEY_LEFTCTRL / KEY_V are passed directly. */
    static uint32_t sequence = 0;
    ei_device_start_emulating(kbd, ++sequence);

    /* Ctrl down, V down, V up, Ctrl up — frame each with monotonic-us stamps. */
    uint64_t t = monotonic_us();
    ei_device_keyboard_key(kbd, KEY_LEFTCTRL, 1);
    ei_device_frame(kbd, t);
    ei_device_keyboard_key(kbd, KEY_V, 1);
    ei_device_frame(kbd, t + 1500);
    ei_device_keyboard_key(kbd, KEY_V, 0);
    ei_device_frame(kbd, t + 6000);
    ei_device_keyboard_key(kbd, KEY_LEFTCTRL, 0);
    ei_device_frame(kbd, t + 7500);

    ei_device_stop_emulating(kbd);

    /* Drain a beat so the compositor consumes the keystrokes before we tear
     * the session down — otherwise the target app may miss the V keypress. */
    int eifd = ei_get_fd(ei);
    for (int i = 0; i < 5; i++) {
        struct pollfd p = { eifd, POLLIN, 0 };
        poll(&p, 1, 20);
        ei_dispatch(ei);
        struct ei_event *e;
        while ((e = ei_get_event(ei))) ei_event_unref(e);
    }

    ei_device_unref(kbd);
    ei_unref(ei);
    return 0;
}

/* ---- entry point -------------------------------------------------------- */

int restash_libei_ctrl_v(void) {
    ctx_t c;
    memset(&c, 0, sizeof(c));
    c.eis_fd = -1;

    c.portal = xdp_portal_new();
    if (!c.portal) return 1;
    c.loop = g_main_loop_new(NULL, FALSE);
    if (!c.loop) { g_object_unref(c.portal); return 2; }

#ifdef HAVE_PORTAL_PERSIST
    /* libportal >= 0.8: request a PERSISTENT session and feed back a saved
     * restore token so the compositor's consent dialog is shown only once. */
    c.restore_in = load_token();
    xdp_portal_create_remote_desktop_session_full(
        c.portal,
        XDP_DEVICE_KEYBOARD,
        XDP_OUTPUT_NONE,
        XDP_REMOTE_DESKTOP_FLAG_NONE,
        XDP_CURSOR_MODE_HIDDEN,
        XDP_PERSIST_MODE_PERSISTENT,
        c.restore_in,
        NULL,
        on_session_created,
        &c
    );
#else
    /* libportal < 0.8 (e.g. 0.7.1 on the current ubuntu-latest runner): the
     * persist-mode variant is not exported, so use the base API. Functionally
     * identical for injecting Ctrl+V; the only difference is the consent dialog
     * re-prompts each launch (still a PERMISSION, never a download). */
    xdp_portal_create_remote_desktop_session(
        c.portal,
        XDP_DEVICE_KEYBOARD,
        XDP_OUTPUT_NONE,
        XDP_REMOTE_DESKTOP_FLAG_NONE,
        XDP_CURSOR_MODE_HIDDEN,
        NULL,
        on_session_created,
        &c
    );
#endif

    g_main_loop_run(c.loop);

    int rc = c.err_code;
    if (rc == 0 && c.eis_fd >= 0) {
        rc = ei_send_ctrl_v(c.eis_fd);
    }

    if (c.eis_fd >= 0) close(c.eis_fd);
    if (c.session) {
        xdp_session_close(c.session);
        g_object_unref(c.session);
    }
    if (c.portal) g_object_unref(c.portal);
    if (c.loop) g_main_loop_unref(c.loop);
    free(c.restore_in);
    return rc;
}
