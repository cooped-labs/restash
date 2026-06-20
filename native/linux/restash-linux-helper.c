/*
 * restash-linux-helper — bundled, CI-built C helper for Restash on Linux.
 *
 * Zero-install policy: committed/CI-built native binary shipped in the AppImage
 * extraResources OUTSIDE asar. It links against:
 *   • libxcb + libxcb-xtest (X11): part of any X11 server runtime, NOT a user
 *     install; still bundled in the AppImage with RPATH so nothing resolves from
 *     the host.
 *   • (optionally, compile with -DHAVE_LIBEI) libei for Wayland input injection
 *     via the org.freedesktop.portal.RemoteDesktop session — bundled in the
 *     AppImage; the compositor shows its OWN one-time consent dialog (a
 *     PERMISSION, not a download).
 *   • Linux uinput (kernel) for the Wayland fallback — the helper IS the daemon,
 *     spawned on demand; /dev/uinput access is the one-time OS permission (a
 *     udev rule granted via the OS pkexec/polkit dialog), never a package.
 *
 * BANNED and absent: xdotool, ydotool, ydotoold, xclip, xsel, wl-copy,
 * wl-paste, wmctrl, xprop, gtk-launch, notify-send.
 *
 * Modes:
 *   --get-active                 Print _NET_ACTIVE_WINDOW id (X11) to stdout.
 *   --paste [window-id]          Activate window + XTEST FakeKeyEvent Ctrl+V (X11).
 *   --paste-wayland              libei/portal (primary) else uinput (fallback).
 *   --clip-files <paths...>      Own the CLIPBOARD selection, serving
 *                                text/uri-list + x-special/gnome-copied-files
 *                                until the next clipboard change or timeout (X11).
 *   --list                       _NET_CLIENT_LIST → JSON [{owner,title}] (X11).
 *   --check-uinput               exit 0 iff /dev/uinput is writable.
 *
 * Build (X11 only, default):
 *   gcc -O2 -o restash-linux-helper restash-linux-helper.c \
 *       -lxcb -lxcb-util -lxcb-xtest
 * Build with Wayland libei:
 *   gcc -O2 -DHAVE_LIBEI -o restash-linux-helper restash-linux-helper.c \
 *       -lxcb -lxcb-util -lxcb-xtest $(pkg-config --cflags --libs libei-1.0)
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <time.h>

/* ---- uinput fallback (Wayland) ------------------------------------------- */
#include <linux/uinput.h>
#include <sys/ioctl.h>

static int uinput_writable(void) {
    int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (fd < 0) return 0;
    close(fd);
    return 1;
}

static void emit(int fd, int type, int code, int val) {
    struct input_event ev;
    memset(&ev, 0, sizeof(ev));
    ev.type = type; ev.code = code; ev.value = val;
    (void)!write(fd, &ev, sizeof(ev));
}

/* Synthesize Ctrl+V via a transient uinput keyboard device. Returns 0 on ok. */
static int uinput_ctrl_v(void) {
    int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (fd < 0) return 10;

    ioctl(fd, UI_SET_EVBIT, EV_KEY);
    ioctl(fd, UI_SET_KEYBIT, KEY_LEFTCTRL);
    ioctl(fd, UI_SET_KEYBIT, KEY_V);

    struct uinput_setup usetup;
    memset(&usetup, 0, sizeof(usetup));
    usetup.id.bustype = BUS_USB;
    usetup.id.vendor  = 0x1209;  /* pid.codes test VID */
    usetup.id.product = 0x5253;  /* 'RS' */
    strcpy(usetup.name, "Restash Virtual Keyboard");
    ioctl(fd, UI_DEV_SETUP, &usetup);
    ioctl(fd, UI_DEV_CREATE);

    /* Compositor needs a beat to bind the new device. */
    struct timespec ts = { 0, 200 * 1000 * 1000 };
    nanosleep(&ts, NULL);

    emit(fd, EV_KEY, KEY_LEFTCTRL, 1); emit(fd, EV_SYN, SYN_REPORT, 0);
    emit(fd, EV_KEY, KEY_V, 1);        emit(fd, EV_SYN, SYN_REPORT, 0);
    emit(fd, EV_KEY, KEY_V, 0);        emit(fd, EV_SYN, SYN_REPORT, 0);
    emit(fd, EV_KEY, KEY_LEFTCTRL, 0); emit(fd, EV_SYN, SYN_REPORT, 0);

    ts.tv_nsec = 50 * 1000 * 1000;
    nanosleep(&ts, NULL);
    ioctl(fd, UI_DEV_DESTROY);
    close(fd);
    return 0;
}

/* ---- X11 / XCB ----------------------------------------------------------- */
#ifndef RESTASH_NO_X11
#include <xcb/xcb.h>
#include <xcb/xtest.h>
#include <xcb/xproto.h>

static xcb_atom_t intern(xcb_connection_t *c, const char *name) {
    xcb_intern_atom_cookie_t ck = xcb_intern_atom(c, 0, (uint16_t)strlen(name), name);
    xcb_intern_atom_reply_t *r = xcb_intern_atom_reply(c, ck, NULL);
    xcb_atom_t a = r ? r->atom : XCB_ATOM_NONE;
    free(r);
    return a;
}

/* Read a CARDINAL/WINDOW property's first 32-bit value from the root window. */
static uint32_t read_root_window_prop(xcb_connection_t *c, xcb_window_t root, xcb_atom_t prop) {
    xcb_get_property_cookie_t ck = xcb_get_property(c, 0, root, prop, XCB_ATOM_ANY, 0, 1);
    xcb_get_property_reply_t *r = xcb_get_property_reply(c, ck, NULL);
    uint32_t v = 0;
    if (r && xcb_get_property_value_length(r) >= 4) {
        v = *(uint32_t *)xcb_get_property_value(r);
    }
    free(r);
    return v;
}

static xcb_window_t root_window(xcb_connection_t *c) {
    const xcb_setup_t *s = xcb_get_setup(c);
    xcb_screen_iterator_t it = xcb_setup_roots_iterator(s);
    return it.data->root;
}

static int x11_get_active(void) {
    xcb_connection_t *c = xcb_connect(NULL, NULL);
    if (xcb_connection_has_error(c)) return 2;
    xcb_window_t root = root_window(c);
    xcb_atom_t net_active = intern(c, "_NET_ACTIVE_WINDOW");
    uint32_t w = read_root_window_prop(c, root, net_active);
    printf("%u\n", w);
    xcb_disconnect(c);
    return 0;
}

static void x11_activate(xcb_connection_t *c, xcb_window_t root, xcb_window_t win) {
    if (!win) return;
    xcb_atom_t net_active = intern(c, "_NET_ACTIVE_WINDOW");
    xcb_client_message_event_t ev;
    memset(&ev, 0, sizeof(ev));
    ev.response_type = XCB_CLIENT_MESSAGE;
    ev.format = 32;
    ev.window = win;
    ev.type = net_active;
    ev.data.data32[0] = 2;            /* source: pager */
    ev.data.data32[1] = XCB_CURRENT_TIME;
    xcb_send_event(c, 0, root,
        XCB_EVENT_MASK_SUBSTRUCTURE_NOTIFY | XCB_EVENT_MASK_SUBSTRUCTURE_REDIRECT,
        (const char *)&ev);
    xcb_flush(c);
}

/* XTEST Ctrl+V to the focused window. Keycodes 37=LCtrl, 55=v on standard PC. */
static int x11_paste(uint32_t target) {
    xcb_connection_t *c = xcb_connect(NULL, NULL);
    if (xcb_connection_has_error(c)) return 2;
    xcb_window_t root = root_window(c);
    if (target) {
        x11_activate(c, root, (xcb_window_t)target);
        struct timespec ts = { 0, 80 * 1000 * 1000 };
        nanosleep(&ts, NULL);
    }
    /* press ctrl, press v, release v, release ctrl */
    xcb_test_fake_input(c, XCB_KEY_PRESS,   37, XCB_CURRENT_TIME, XCB_NONE, 0, 0);
    xcb_test_fake_input(c, XCB_KEY_PRESS,   55, XCB_CURRENT_TIME, XCB_NONE, 0, 0);
    xcb_test_fake_input(c, XCB_KEY_RELEASE, 55, XCB_CURRENT_TIME, XCB_NONE, 0, 0);
    xcb_test_fake_input(c, XCB_KEY_RELEASE, 37, XCB_CURRENT_TIME, XCB_NONE, 0, 0);
    xcb_flush(c);
    struct timespec ts2 = { 0, 50 * 1000 * 1000 };
    nanosleep(&ts2, NULL);
    xcb_disconnect(c);
    return 0;
}

static void json_escape(const char *s) {
    for (; *s; s++) {
        unsigned char ch = (unsigned char)*s;
        if (ch == '"' || ch == '\\') { putchar('\\'); putchar(ch); }
        else if (ch == '\n') fputs("\\n", stdout);
        else if (ch < 0x20) printf("\\u%04x", ch);
        else putchar(ch);
    }
}

static char *read_str_prop(xcb_connection_t *c, xcb_window_t w, xcb_atom_t prop) {
    xcb_get_property_cookie_t ck = xcb_get_property(c, 0, w, prop, XCB_ATOM_ANY, 0, 256);
    xcb_get_property_reply_t *r = xcb_get_property_reply(c, ck, NULL);
    if (!r) return NULL;
    int len = xcb_get_property_value_length(r);
    char *out = NULL;
    if (len > 0) {
        out = malloc(len + 1);
        memcpy(out, xcb_get_property_value(r), len);
        out[len] = '\0';
    }
    free(r);
    return out;
}

static int x11_list(void) {
    xcb_connection_t *c = xcb_connect(NULL, NULL);
    if (xcb_connection_has_error(c)) { printf("[]"); return 0; }
    xcb_window_t root = root_window(c);
    xcb_atom_t client_list = intern(c, "_NET_CLIENT_LIST");
    xcb_atom_t net_name    = intern(c, "_NET_WM_NAME");

    xcb_get_property_cookie_t ck = xcb_get_property(c, 0, root, client_list, XCB_ATOM_WINDOW, 0, 1024);
    xcb_get_property_reply_t *r = xcb_get_property_reply(c, ck, NULL);
    putchar('[');
    int first = 1;
    if (r) {
        int n = xcb_get_property_value_length(r) / 4;
        uint32_t *wins = (uint32_t *)xcb_get_property_value(r);
        for (int i = 0; i < n; i++) {
            char *title = read_str_prop(c, wins[i], net_name);
            if (!title) title = read_str_prop(c, wins[i], XCB_ATOM_WM_NAME);
            char *owner = read_str_prop(c, wins[i], XCB_ATOM_WM_CLASS);
            if (!first) putchar(',');
            first = 0;
            fputs("{\"owner\":\"", stdout); json_escape(owner ? owner : "");
            fputs("\",\"title\":\"", stdout); json_escape(title ? title : "");
            fputs("\"}", stdout);
            free(title); free(owner);
        }
    }
    free(r);
    putchar(']');
    xcb_disconnect(c);
    return 0;
}

/* Own the CLIPBOARD selection and serve text/uri-list + gnome-copied-files.
 * Stays alive (must, to serve paste requests) until the selection is lost or a
 * timeout. NO xclip / wl-copy. */
static int x11_clip_files(int count, char **paths) {
    if (count <= 0) return 2;
    xcb_connection_t *c = xcb_connect(NULL, NULL);
    if (xcb_connection_has_error(c)) return 2;
    const xcb_setup_t *setup = xcb_get_setup(c);
    xcb_screen_t *screen = xcb_setup_roots_iterator(setup).data;

    xcb_window_t owner = xcb_generate_id(c);
    uint32_t mask = XCB_CW_EVENT_MASK;
    uint32_t vals[] = { XCB_EVENT_MASK_PROPERTY_CHANGE };
    xcb_create_window(c, XCB_COPY_FROM_PARENT, owner, screen->root,
        0, 0, 1, 1, 0, XCB_WINDOW_CLASS_INPUT_OUTPUT, screen->root_visual, mask, vals);

    xcb_atom_t clipboard   = intern(c, "CLIPBOARD");
    xcb_atom_t targets     = intern(c, "TARGETS");
    xcb_atom_t uri_list    = intern(c, "text/uri-list");
    xcb_atom_t gnome_files = intern(c, "x-special/gnome-copied-files");
    xcb_atom_t utf8        = intern(c, "UTF8_STRING");

    /* Build payloads. uri-list = file:// URIs, newline-separated. */
    char uris[8192] = ""; char gnome[8192] = "copy\n";
    for (int i = 0; i < count; i++) {
        char line[2048];
        snprintf(line, sizeof(line), "file://%s\n", paths[i]);
        strncat(uris, line, sizeof(uris) - strlen(uris) - 1);
        strncat(gnome, line, sizeof(gnome) - strlen(gnome) - 1);
    }

    xcb_set_selection_owner(c, owner, clipboard, XCB_CURRENT_TIME);
    xcb_flush(c);

    time_t start = time(NULL);
    xcb_generic_event_t *e;
    for (;;) {
        /* serve for up to 120s or until ownership lost */
        if (time(NULL) - start > 120) break;
        e = xcb_poll_for_event(c);
        if (!e) {
            struct timespec ts = { 0, 20 * 1000 * 1000 };
            nanosleep(&ts, NULL);
            /* lost ownership? */
            xcb_get_selection_owner_reply_t *so =
                xcb_get_selection_owner_reply(c, xcb_get_selection_owner(c, clipboard), NULL);
            int lost = (so && so->owner != owner);
            free(so);
            if (lost) break;
            continue;
        }
        switch (e->response_type & ~0x80) {
        case XCB_SELECTION_REQUEST: {
            xcb_selection_request_event_t *req = (xcb_selection_request_event_t *)e;
            xcb_selection_notify_event_t notify;
            memset(&notify, 0, sizeof(notify));
            notify.response_type = XCB_SELECTION_NOTIFY;
            notify.requestor = req->requestor;
            notify.selection = req->selection;
            notify.target = req->target;
            notify.time = req->time;
            notify.property = req->property;

            if (req->target == targets) {
                xcb_atom_t list[] = { targets, uri_list, gnome_files, utf8 };
                xcb_change_property(c, XCB_PROP_MODE_REPLACE, req->requestor,
                    req->property, XCB_ATOM_ATOM, 32, 4, list);
            } else if (req->target == uri_list) {
                xcb_change_property(c, XCB_PROP_MODE_REPLACE, req->requestor,
                    req->property, uri_list, 8, strlen(uris), uris);
            } else if (req->target == gnome_files) {
                xcb_change_property(c, XCB_PROP_MODE_REPLACE, req->requestor,
                    req->property, gnome_files, 8, strlen(gnome), gnome);
            } else if (req->target == utf8) {
                xcb_change_property(c, XCB_PROP_MODE_REPLACE, req->requestor,
                    req->property, utf8, 8, strlen(uris), uris);
            } else {
                notify.property = XCB_NONE;
            }
            xcb_send_event(c, 0, req->requestor, XCB_EVENT_MASK_NO_EVENT, (const char *)&notify);
            xcb_flush(c);
            break;
        }
        case XCB_SELECTION_CLEAR:
            free(e);
            xcb_disconnect(c);
            return 0; /* someone else took the clipboard */
        }
        free(e);
    }
    xcb_disconnect(c);
    return 0;
}
#else
static int x11_get_active(void) { return 2; }
static int x11_paste(uint32_t t) { (void)t; return 2; }
static int x11_list(void) { printf("[]"); return 0; }
static int x11_clip_files(int c, char **p) { (void)c; (void)p; return 2; }
#endif

/* ---- Wayland paste (libei portal primary, uinput fallback) --------------- */
static int wayland_paste(void) {
#ifdef HAVE_LIBEI
    /* The libei + org.freedesktop.portal.RemoteDesktop path. On first paste the
     * helper opens a RemoteDesktop session; the compositor shows its OWN
     * one-time consent dialog (a PERMISSION, not a download). The portal's
     * restore_token is persisted by the platform layer so subsequent sessions
     * reconnect WITHOUT re-prompting. Implementation requires libei + a portal
     * D-Bus round trip; see native/linux/wayland_ei.c (linked when -DHAVE_LIBEI).
     * Falls through to uinput when the portal session can't be established. */
    extern int restash_libei_ctrl_v(void); /* provided by wayland_ei.c */
    if (restash_libei_ctrl_v() == 0) return 0;
#endif
    /* Fallback: uinput. /dev/uinput access is the one-time OS permission. */
    if (uinput_writable()) return uinput_ctrl_v();
    /* Last resort: copy-only is handled by the JS layer; signal failure. */
    return 20;
}

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr, "usage: restash-linux-helper --get-active|--paste [id]|--paste-wayland|--clip-files <paths...>|--list|--check-uinput\n");
        return 1;
    }
    if (strcmp(argv[1], "--get-active") == 0)   return x11_get_active();
    if (strcmp(argv[1], "--paste") == 0)        return x11_paste(argc >= 3 ? (uint32_t)strtoul(argv[2], NULL, 10) : 0);
    if (strcmp(argv[1], "--paste-wayland") == 0) return wayland_paste();
    if (strcmp(argv[1], "--clip-files") == 0)   return x11_clip_files(argc - 2, argv + 2);
    if (strcmp(argv[1], "--list") == 0)         return x11_list();
    if (strcmp(argv[1], "--check-uinput") == 0) return uinput_writable() ? 0 : 1;
    fprintf(stderr, "unknown mode: %s\n", argv[1]);
    return 1;
}
