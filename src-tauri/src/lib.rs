use rust_embed::RustEmbed;

mod plugins;
mod share;

/// The built frontend (Vite output). In release it is embedded into the binary;
/// in debug it is read from disk at runtime, so a prior `npm run build` is what
/// populates it. Same assets the native webview uses — served verbatim over HTTP
/// in `-serve` and live-share modes.
#[derive(RustEmbed)]
#[folder = "../dist"]
pub(crate) struct WebAssets;

/// Write raw bytes to an absolute path chosen via the save dialog.
/// Used by the frontend export flow (JSON / PNG / SVG) since browser-style
/// `<a download>` does not work inside the Tauri webview.
#[tauri::command]
fn write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &contents).map_err(|e| e.to_string())
}

/// Minimal content-type table covering every file type Vite emits. Avoids
/// pulling in a mime crate and stays correct across rust-embed versions.
pub(crate) fn mime_for(path: &str) -> &'static str {
    match path.rsplit('.').next() {
        Some("html") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") | Some("map") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("wasm") => "application/wasm",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// `-serve` / `--serve` (or bare `serve`) switches to headless web mode.
fn wants_serve(args: &[String]) -> bool {
    args.iter()
        .any(|a| a == "-serve" || a == "--serve" || a == "serve")
}

/// `-port N`, `--port N` or `--port=N`; defaults to 8080.
fn parse_port(args: &[String]) -> u16 {
    for (i, a) in args.iter().enumerate() {
        if a == "-port" || a == "--port" {
            if let Some(p) = args.get(i + 1).and_then(|v| v.parse().ok()) {
                return p;
            }
        }
        if let Some(p) = a.strip_prefix("--port=").and_then(|v| v.parse().ok()) {
            return p;
        }
    }
    8080
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    if wants_serve(&args) {
        share::serve_blocking(parse_port(&args));
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(share::ShareMgr::default())
        .invoke_handler(tauri::generate_handler![
            write_file,
            share::share_start,
            share::share_stop,
            share::share_status,
            plugins::plugins_list,
            plugins::plugin_read,
            plugins::plugin_read_bytes,
            plugins::plugin_remove,
            plugins::plugin_install,
            plugins::plugin_install_file,
            plugins::dev_plugins_list,
            plugins::dev_plugins_fingerprint,
            plugins::dev_plugin_read,
            plugins::dev_plugin_read_bytes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
