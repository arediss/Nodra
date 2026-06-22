//! Live-share server: serves the embedded web app and relays Yjs collaboration
//! messages between peers over WebSocket. The relay is "dumb" — it only
//! broadcasts each message to the other peers of the same room (the token);
//! all CRDT logic lives in the JS clients.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::{header, StatusCode, Uri},
    response::IntoResponse,
    routing::{any, get},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::plugins;
use crate::{mime_for, WebAssets};

/// Bounded so one stalled/slow peer can't grow an unbounded queue; excess frames
/// for a saturated peer are dropped (it catches up via Yjs state sync).
const PEER_QUEUE: usize = 256;

type PeerTx = mpsc::Sender<Message>;
/// peer id -> (outgoing channel, is_host)
type Peers = HashMap<u64, (PeerTx, bool)>;
/// room token -> peers
type Rooms = Arc<Mutex<HashMap<String, Peers>>>;

static NEXT_PEER: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct ShareMgr {
    inner: Mutex<ShareInner>,
}

#[derive(Default)]
struct ShareInner {
    shutdown: Option<oneshot::Sender<()>>,
    handle: Option<tokio::task::JoinHandle<()>>,
    info: Option<ServeInfo>,
    rooms: Option<Rooms>,
}

#[derive(Clone, Serialize)]
pub struct ServeInfo {
    /// Host's own URL (localhost) — what the host webview joins.
    pub url: String,
    /// Shareable LAN URL with the room token — what the host hands to a guest.
    pub guest_url: String,
    pub lan_ip: String,
    pub port: u16,
    pub token: String,
}

#[derive(Serialize)]
pub struct ShareStatus {
    sharing: bool,
    info: Option<ServeInfo>,
    /// Connected guests (the host's own webview connection is excluded).
    peers: u32,
}

fn lan_ip() -> String {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn router(rooms: Rooms) -> Router {
    Router::new()
        .route("/sync", any(ws_handler))
        // Disk-served plugins over HTTP, so web clients load the same plugins
        // installed natively on this machine. Registered BEFORE the static
        // fallback; neither path clashes with /sync.
        .route("/api/plugins", get(plugins_list_handler))
        .route("/api/plugins/{id}/{*rel}", get(plugin_asset_handler))
        .fallback(static_handler)
        .with_state(rooms)
}

/// GET /api/plugins -> JSON array of installed plugin manifests (same data as the
/// Tauri `plugins_list` command; resolved without an AppHandle).
async fn plugins_list_handler() -> impl IntoResponse {
    let base = match plugins::plugins_dir_base() {
        Ok(b) => b,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "plugins dir").into_response(),
    };
    match plugins::list_installed(&base) {
        Ok(list) => Json(list).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "list failed").into_response(),
    }
}

/// GET /api/plugins/{id}/{*rel} -> serve `<app-data>/plugins/{id}/<rel>`. Path-traversal
/// safe: `{id}` is validated and the canonicalized target is asserted to stay inside
/// the plugin dir (same guards as the Tauri read commands, shared impl).
async fn plugin_asset_handler(Path((id, rel)): Path<(String, String)>) -> impl IntoResponse {
    let base = match plugins::plugins_dir_base() {
        Ok(b) => b,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "plugins dir").into_response(),
    };
    // Classify up front: an unsafe id or a traversal/absolute rel is a 400; a
    // well-formed path that simply doesn't exist falls through to a 404 below.
    if plugins::safe_id(&id).is_err()
        || rel.is_empty()
        || rel.contains("..")
        || rel.starts_with('/')
        || rel.contains('\\')
    {
        return (StatusCode::BAD_REQUEST, "bad request").into_response();
    }
    let path = match plugins::resolve_plugin_asset(&base, &id, &rel) {
        Ok(p) => p,
        Err(_) => return (StatusCode::NOT_FOUND, "404 Not Found").into_response(),
    };
    match std::fs::read(&path) {
        Ok(bytes) => (
            [(header::CONTENT_TYPE, mime_for(path.to_str().unwrap_or("")))],
            bytes,
        )
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "404 Not Found").into_response(),
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
    State(rooms): State<Rooms>,
) -> impl IntoResponse {
    let room = params.get("room").cloned().unwrap_or_default();
    let is_host = params.get("host").map(|v| v == "1").unwrap_or(false);
    ws.on_upgrade(move |socket| handle_socket(socket, room, is_host, rooms))
}

async fn handle_socket(socket: WebSocket, room: String, is_host: bool, rooms: Rooms) {
    let peer_id = NEXT_PEER.fetch_add(1, Ordering::Relaxed);
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (tx, mut rx) = mpsc::channel::<Message>(PEER_QUEUE);

    rooms
        .lock()
        .await
        .entry(room.clone())
        .or_default()
        .insert(peer_id, (tx, is_host));

    // Pump this peer's outgoing channel to its socket.
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Relay this peer's incoming messages to every OTHER peer in the room.
    let rooms_r = rooms.clone();
    let room_r = room.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            match msg {
                Message::Binary(_) | Message::Text(_) => {
                    let guard = rooms_r.lock().await;
                    if let Some(peers) = guard.get(&room_r) {
                        for (id, (peer_tx, _)) in peers.iter() {
                            if *id != peer_id {
                                // Drop for a saturated peer rather than block the room.
                                let _ = peer_tx.try_send(msg.clone());
                            }
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    let mut guard = rooms.lock().await;
    if let Some(peers) = guard.get_mut(&room) {
        peers.remove(&peer_id);
        if peers.is_empty() {
            guard.remove(&room);
        }
    }
}

async fn static_handler(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let candidate = if path.is_empty() { "index.html" } else { path };
    // Fall back to index.html so deep links / hash routes still load.
    let (resolved, file) = match WebAssets::get(candidate) {
        Some(f) => (candidate.to_string(), Some(f)),
        None => ("index.html".to_string(), WebAssets::get("index.html")),
    };
    match file {
        Some(f) => (
            [(header::CONTENT_TYPE, mime_for(&resolved))],
            f.data.into_owned(),
        )
            .into_response(),
        None => (StatusCode::NOT_FOUND, "404 Not Found").into_response(),
    }
}

async fn bind(port: u16) -> Result<tokio::net::TcpListener, String> {
    tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| format!("port {port} indisponible ({e})"))
}

// ---------------------------------------------------------------- Tauri commands

#[tauri::command]
pub async fn share_start(
    port: u16,
    token: String,
    state: tauri::State<'_, ShareMgr>,
) -> Result<ServeInfo, String> {
    let mut inner = state.inner.lock().await;
    if inner.shutdown.is_some() {
        if let Some(info) = &inner.info {
            return Ok(info.clone());
        }
    }

    let listener = bind(port).await?;
    let rooms: Rooms = Arc::new(Mutex::new(HashMap::new()));
    let (sd_tx, sd_rx) = oneshot::channel::<()>();
    let app = router(rooms.clone());

    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = sd_rx.await;
            })
            .await;
    });

    let ip = lan_ip();
    let info = ServeInfo {
        url: format!("http://localhost:{port}/#room={token}"),
        guest_url: format!("http://{ip}:{port}/#room={token}"),
        lan_ip: ip,
        port,
        token,
    };
    inner.shutdown = Some(sd_tx);
    inner.handle = Some(handle);
    inner.info = Some(info.clone());
    inner.rooms = Some(rooms);
    Ok(info)
}

#[tauri::command]
pub async fn share_stop(state: tauri::State<'_, ShareMgr>) -> Result<(), String> {
    // Take everything out under the lock, then release it before awaiting the
    // server to actually stop — so a follow-up share_start on the same port
    // doesn't race a still-bound listener.
    let (sd, handle) = {
        let mut inner = state.inner.lock().await;
        inner.info = None;
        inner.rooms = None;
        (inner.shutdown.take(), inner.handle.take())
    };
    if let Some(sd) = sd {
        let _ = sd.send(());
    }
    if let Some(h) = handle {
        let _ = tokio::time::timeout(Duration::from_secs(2), h).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn share_status(state: tauri::State<'_, ShareMgr>) -> Result<ShareStatus, String> {
    let inner = state.inner.lock().await;
    let peers = if let Some(rooms) = &inner.rooms {
        rooms
            .lock()
            .await
            .values()
            .map(|peers| peers.values().filter(|(_, is_host)| !*is_host).count() as u32)
            .sum()
    } else {
        0
    };
    Ok(ShareStatus {
        sharing: inner.shutdown.is_some(),
        info: inner.info.clone(),
        peers,
    })
}

// ---------------------------------------------------------------- CLI `-serve`

/// Blocking server for the headless `-serve` web mode (no native window).
pub fn serve_blocking(port: u16) {
    if WebAssets::get("index.html").is_none() {
        eprintln!(
            "Nodra : build web introuvable. Lance `npm run build` d'abord \
             (le mode -serve sert le dossier dist/)."
        );
        std::process::exit(1);
    }
    let rt = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("Nodra : runtime async indisponible ({e}).");
            std::process::exit(1);
        }
    };
    rt.block_on(async move {
        let listener = match bind(port).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("Nodra : {e}");
                std::process::exit(1);
            }
        };
        let rooms: Rooms = Arc::new(Mutex::new(HashMap::new()));
        println!("Nodra — mode web + partage");
        println!("  ▸ http://localhost:{port}   (Ctrl+C pour arrêter)");
        let _ = axum::serve(listener, router(rooms)).await;
    });
}
