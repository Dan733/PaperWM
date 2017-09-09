/* Signals: */

function _repl() {
    add_all_from_workspace()

    meta_window = pages[0]
//: [object instance proxy GType:MetaWindowX11 jsobj@0x7f8c39e52f70 native@0x3d43880]
    workspace = meta_window.get_workspace()
//: [object instance proxy GIName:Meta.Workspace jsobj@0x7f8c47166790 native@0x23b5360]

    actor = meta_window.get_compositor_private()

    actor.z_position

    meta = imports.gi.Meta
    meta_window.get_layer()

    // Use to control the stack level
    meta_window.raise()
    meta_window.lower()

    let length = 0
    pages.map((meta_window) => {
        let width = meta_window.get_frame_rect().width
        meta_window.move_resize_frame(true, length, 25, width, global.screen_height - 30)
        length += width + overlap
    })
}

function log() {
    function zeropad(x) {
        x = x.toString();
        if(x.length == 1) return "0"+x;
        else return x;
    }
    let now = new Date();
    let timeString = zeropad(now.getHours())
        + ":" + zeropad(now.getMinutes())
        + ":" + zeropad(now.getSeconds())
    print(timeString + " | " + Array.prototype.join.call(arguments, " "));
}


pages = []
focus = () => {
    return pages.indexOf(global.display.focus_window)
}

window_gap = 10
margin_lr = 20
margin_tb = 4
overlap = 10
glib = imports.gi.GLib

Tweener = imports.ui.tweener;
margin = 75
move = (meta_window, x, y) => {
    let actor = meta_window.get_compositor_private()
    let buffer = actor.meta_window.get_buffer_rect();
    let frame = actor.meta_window.get_frame_rect();
    x = Math.min(global.screen_width - margin, x)
    x = Math.max(margin - frame.width, x)
    let x_offset = frame.x - buffer.x;
    let y_offset = frame.y - buffer.y;
    let scale = 1
    if (x >= global.screen_width - margin || x <= margin - frame.width)
        scale = 0.95
    actor.scale_center_y = frame.height/2
    Tweener.addTween(actor, {x: x - x_offset
                             , y: y - y_offset
                             , time: 0.5
                             , scale_x: scale
                             , scale_y: scale
                             , onComplete: () => {
                                 actor.meta_window.move_frame(true, x, y);
                             }})

}

timestamp = () => {
    return glib.get_monotonic_time()/1000
}


rect = (meta_window) => {
    frame = meta_window.get_frame_rect()
    return [frame.x, frame.x + frame.width]
}


ensure_viewport = (meta_window) => {
    let [start, end] = rect(meta_window)

    let index = pages.indexOf(meta_window)
    let margin = overlap*2
    if (index == pages.length - 1 || index == 0)
        margin = 0
    if (end >= global.screen_width - margin) {
        propogate_forward(index + 1, global.screen_width, true)
        propogate_backward(index, global.screen_width - margin, false)
    }
    else if (start <= margin) {
        propogate_forward(index, margin, false)
        propogate_backward(index - 1, -global.screen_width, false)
    }
}

framestr = (rect) => {
    return "[ x:"+rect.x + ", y:" + rect.y + " w:" + rect.width + " h:"+rect.height + " ]";
}

focus_handler = (meta_window, user_data) => {
    log("focus", meta_window, framestr(meta_window.get_frame_rect()));

    ensure_viewport(meta_window)
    meta_window.activate(timestamp())

    // focus = pages.indexOf(meta_window)
}

propogate_forward = (n, x, lower) => {
    if (n < 0 || n >= pages.length)
        return
    // print("positioning " + n)
    let meta_window = pages[n]
    if (lower)
        meta_window.lower()
    move(meta_window, x, 20 + margin_tb)
    propogate_forward(n+1, x+meta_window.get_frame_rect().width + overlap, true)
}
propogate_backward = (n, x, lower) => {
    if (n < 0 || n >= pages.length)
        return
    // print("positioning " + n)
    let meta_window = pages[n]
    x = x - meta_window.get_frame_rect().width
    if (lower)
        meta_window.lower()
    move(meta_window, x, 20 + margin_tb)
    propogate_backward(n-1, x - overlap, true)
}

focus_wrapper = (meta_window, user_data) => {
    focus_handler(meta_window, user_data)
}

add_handler = (ws, meta_window) => {
    log("window-added", meta_window);
    let focus_i = focus()

    // Should inspert at index 0 if focus() returns -1
    pages.splice(focus_i + 1, 0, meta_window)

    if (focus_i > -1) {
        let frame = pages[focus_i].get_frame_rect()
        print("position: " + (frame.x + frame.width))
        print("before resize")
        meta_window.move_resize_frame(true, frame.x + frame.width + overlap, 20, meta_window.get_frame_rect().width, global.screen_height - 20 - margin_tb*2)
        print("after resize")
    }
    meta_window.connect("focus", focus_wrapper)

    ensure_viewport(meta_window)
}

remove_handler = (ws, meta_window) => {
    log("window-removed", meta_window, meta_window.title);
    // Note: If `meta_window` was closed and had focus at the time, the next
    // window has already received the `focus` signal at this point.

    let removed_i = pages.indexOf(meta_window)
    if (removed_i < 0)
        return
    pages.splice(removed_i, 1)

    // At this point the `focus` index might be invalid so we correct it:
    if(removed_i < focus) {
        focus--;
    }
    // Remove our signal handlers: Needed for non-closed windows.
    // (closing a window seems to clean out it's signal handlers)
    meta_window.disconnect(focus_wrapper);

    // Re-layout: Needed if the removed window didn't have focus.
    // Not sure if we can check if that was the case or not?
    focus_handler(pages[focus])
}

add_all_from_workspace = (workspace) => {
    workspace = workspace || global.screen.get_active_workspace();
    workspace.list_windows().forEach((meta_window, i) => {
        if(pages.indexOf(meta_window) < 0) {
            add_handler(workspace, meta_window)
        }
    })
}

/**
 * Look up the signal handler by name so the handler can be redefined without
 * re-registering to the signal.
 * (generic name? bind_to_name? named_function? dynamic_function_reference?)
 */
wrapped_signal_handler = (handler_name, owner_obj) => {
    owner_obj = owner_obj || window;
    return function() {
        owner_obj[handler_name].apply(owner_obj, arguments);
    }
}

// Initialize workspaces
workspaces = []
for (let i=0; i < global.screen.n_workspaces; i++) {
    workspaces[i] = []
    let workspace = global.screen.get_workspace_by_index(i)
    print("workspace: " + workspace)
    workspace.connect("window-added", wrapped_signal_handler("add_handler"))
    workspace.connect("window-removed", wrapped_signal_handler("remove_handler"));
}

next = () => {
    pages[focus()+1].activate(timestamp)
}
previous = () => {
    pages[focus()-1].activate(timestamp)
}

settings = new Gio.Settings({ schema_id: "org.gnome.desktop.wm.keybindings"});
settings.set_strv("cycle-windows", ["<alt>period"])
settings.set_strv("cycle-windows-backward", ["<alt>comma"])
settings.set_strv("switch-windows", [])
Meta.keybindings_set_custom_handler("cycle-windows", next);
Meta.keybindings_set_custom_handler("cycle-windows-backward", previous);
