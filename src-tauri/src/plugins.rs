//! Disk plugin storage (Brick #1.5). Plugins live in `<app-data>/plugins/<id>/`.
//! These commands list/read/remove them; the frontend loader turns the source
//! into a blob-URL and imports it. All paths are validated to stay inside the
//! plugins dir (no traversal). Code is read, never executed, on the Rust side.

use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

/// Hard cap on a downloaded plugin archive (compressed).
const MAX_PLUGIN_BYTES: usize = 25 * 1024 * 1024;
/// Hard cap on the total DECOMPRESSED size (zip-bomb defense).
const MAX_DECOMPRESSED_BYTES: u64 = 64 * 1024 * 1024;
/// Hard cap on the NUMBER of archive entries (directory-flood / metadata DoS guard).
const MAX_ENTRIES: usize = 10_000;

/// Bundle identifier — MUST stay in sync with `identifier` in tauri.conf.json.
/// Tauri's `app_data_dir()` resolves to `dirs::data_dir()/<identifier>`, so the
/// `-serve` (no-AppHandle) resolver below reuses the same constant to land on the
/// exact same on-disk directory the desktop commands use.
pub const BUNDLE_IDENTIFIER: &str = "app.nodra.diagrams";

#[derive(Serialize)]
pub struct InstalledPlugin {
    pub id: String,
    pub manifest: serde_json::Value,
}

/// A plugin discovered under a developer-chosen dev folder. `base` is the path of
/// the folder it loads from, RELATIVE to the dev dir (e.g. "myplugin/dist" or
/// "myplugin"); the frontend reads its code/assets from there with no copy.
#[derive(Serialize)]
pub struct DevPlugin {
    pub id: String,
    pub manifest: serde_json::Value,
    pub base: String,
}

/// A cheap change signature for a dev plugin's loaded code file, used by the
/// frontend hot-reload watcher to detect a rebuild without re-reading the source.
/// `sig` is `"<mtime_ms>-<size>"`; any change to the built file flips it.
#[derive(Serialize)]
pub struct DevFingerprint {
    pub id: String,
    pub sig: String,
}

/// Resolve `<app-data>/plugins` WITHOUT a Tauri AppHandle (the `-serve` web mode
/// has no AppHandle). This mirrors Tauri's own `app_data_dir()`, which is defined
/// as `dirs::data_dir()/<bundle identifier>` (see tauri `path/desktop.rs`), so it
/// resolves to the identical directory that the desktop `plugins_dir(app)` returns
/// — plugins installed natively on this machine are therefore served by `-serve`.
pub fn plugins_dir_base() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or_else(|| "could not resolve OS data dir".to_string())?
        .join(BUNDLE_IDENTIFIER)
        .join("plugins");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("plugins");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Plugin ids are reverse-domain: only `[A-Za-z0-9._-]`, never path separators.
/// Reject all-dots ids ("." / ".." / "…") so an id can never resolve the base
/// out of the plugins dir.
pub fn safe_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 128
        && !id.chars().all(|c| c == '.')
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    if ok {
        Ok(())
    } else {
        Err(format!("invalid plugin id: {id}"))
    }
}

/// List installed plugins under a resolved plugins base dir. Shared by the Tauri
/// `plugins_list` command and the `-serve` HTTP handler (one implementation).
pub fn list_installed(base: &PathBuf) -> Result<Vec<InstalledPlugin>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(base).map_err(|e| e.to_string())? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let text = match fs::read_to_string(entry.path().join("manifest.json")) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let manifest: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let id = manifest
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        if safe_id(&id).is_err() {
            continue;
        }
        // Defense in depth: the folder name must match the manifest id.
        if entry.file_name().to_string_lossy() != id {
            continue;
        }
        out.push(InstalledPlugin { id, manifest });
    }
    Ok(out)
}

/// Validate `id`/`file` and return the canonical, in-bounds path of an asset under
/// `<base>/<id>/<file>`. `file` may be a nested relative path (e.g. `assets/x.svg`)
/// but must not escape the plugin dir: traversal/absolute components are rejected
/// and the canonicalized target is asserted to stay within the canonical base.
/// Shared by every reader (Tauri text/bytes commands + the HTTP asset handler).
pub fn resolve_plugin_asset(base: &PathBuf, id: &str, file: &str) -> Result<PathBuf, String> {
    safe_id(id)?;
    // No traversal, no absolute paths, no backslashes (Windows separators).
    if file.is_empty()
        || file.contains("..")
        || file.starts_with('/')
        || file.contains('\\')
    {
        return Err(format!("invalid plugin file: {file}"));
    }
    let plugin_base = base.join(id);
    let target = plugin_base.join(file);
    // Canonical containment check (both must exist).
    let canon_base = fs::canonicalize(&plugin_base).map_err(|e| e.to_string())?;
    let canon_target = fs::canonicalize(&target).map_err(|e| e.to_string())?;
    if canon_target == canon_base || !canon_target.starts_with(&canon_base) {
        return Err("path escapes plugin dir".into());
    }
    Ok(canon_target)
}

/// Resolve `<dir>/<rel>` under an already-canonicalized base, applying the same
/// containment guard as `resolve_plugin_asset`: `rel` may be a nested relative path
/// but must not escape `canon_dir` (no traversal/absolute/backslash), and the
/// canonicalized target must stay within it. Used by the dev-folder readers, where
/// `dir` is user-chosen but still must not let a `rel` reach outside it.
fn resolve_dev_path(canon_dir: &PathBuf, rel: &str) -> Result<PathBuf, String> {
    // No traversal, no absolute paths, no backslashes (Windows separators), no NUL
    // (embedded NULs get silently truncated by the C layer — reject defensively).
    if rel.is_empty()
        || rel.contains("..")
        || rel.starts_with('/')
        || rel.contains('\\')
        || rel.contains('\0')
    {
        return Err(format!("invalid path: {rel}"));
    }
    let target = canon_dir.join(rel);
    let canon_target = fs::canonicalize(&target).map_err(|e| e.to_string())?;
    if !canon_target.starts_with(canon_dir) {
        return Err("path escapes dev dir".into());
    }
    Ok(canon_target)
}

/// List built plugins found under a developer-chosen dev folder. Each immediate
/// subdir is inspected for a built plugin: prefer `<sub>/dist/manifest.json` (the
/// `build:plugin` output layout), else flat `<sub>/manifest.json`. The manifest is
/// parsed; its `id` must be a safe id. Nothing is written or copied — the returned
/// `base` (relative to `dir`) is where the frontend reads the code from. The dev
/// folder is user-chosen/trusted, but traversal is still forbidden: `dir` is
/// canonicalized once and every manifest path is asserted to stay within it.
#[tauri::command]
pub fn dev_plugins_list(dir: String) -> Result<Vec<DevPlugin>, String> {
    let canon_dir = fs::canonicalize(&dir).map_err(|e| e.to_string())?;
    if !canon_dir.is_dir() {
        return Err(format!("not a directory: {dir}"));
    }
    dev_plugins_list_in(&canon_dir)
}

/// Core dev-plugin discovery against an *already-canonicalized* base. Split out of
/// `dev_plugins_list` so callers that have a canon dir (e.g.
/// `dev_plugins_fingerprint`) can reuse the SAME canonicalization for their
/// `resolve_dev_path` containment checks — canonicalizing the original `dir` string
/// twice would be a TOCTOU hole if the dev folder is a symlink whose target is
/// re-pointed between the two calls. All containment guards here use `canon_dir`.
fn dev_plugins_list_in(canon_dir: &PathBuf) -> Result<Vec<DevPlugin>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(canon_dir).map_err(|e| e.to_string())? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let sub = entry.file_name().to_string_lossy().to_string();
        // Prefer the build output layout (dist/), then the flat layout.
        let candidates = ["dist", ""];
        for inner in candidates {
            let rel_base = if inner.is_empty() {
                sub.clone()
            } else {
                format!("{sub}/{inner}")
            };
            let manifest_rel = format!("{rel_base}/manifest.json");
            // Containment guard: the manifest path must stay within the dev dir.
            let manifest_path = match resolve_dev_path(canon_dir, &manifest_rel) {
                Ok(p) => p,
                Err(_) => continue,
            };
            let text = match fs::read_to_string(&manifest_path) {
                Ok(t) => t,
                Err(_) => continue,
            };
            let manifest: serde_json::Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let id = manifest
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if safe_id(&id).is_err() {
                continue;
            }
            out.push(DevPlugin {
                id,
                manifest,
                base: rel_base,
            });
            break; // first matching layout wins for this subdir
        }
    }
    Ok(out)
}

/// Cheap change signatures for every dev plugin's loaded code file, for the
/// frontend hot-reload watcher. Reuses `dev_plugins_list` to discover the plugins,
/// then stats each one's `<base>/<main or index.js>` and emits `"<mtime_ms>-<len>"`.
/// Fail-soft: a plugin whose code file is missing/unreadable is skipped (so a
/// mid-rebuild absence never aborts the whole tick). Read-only.
#[tauri::command]
pub fn dev_plugins_fingerprint(dir: String) -> Result<Vec<DevFingerprint>, String> {
    let canon_dir = fs::canonicalize(&dir).map_err(|e| e.to_string())?;
    // Reuse the SAME canonicalization for discovery and the per-file containment
    // checks below — re-canonicalizing `dir` inside `dev_plugins_list` would race a
    // symlinked dev folder being re-pointed between the two resolutions (TOCTOU).
    let plugins = dev_plugins_list_in(&canon_dir)?;
    let mut out = Vec::new();
    for p in plugins {
        let main = p
            .manifest
            .get("main")
            .and_then(|v| v.as_str())
            .unwrap_or("index.js");
        let code_rel = format!("{}/{}", p.base, main);
        // Containment guard + stat; skip a plugin whose file is missing/unreadable.
        let path = match resolve_dev_path(&canon_dir, &code_rel) {
            Ok(p) => p,
            Err(_) => continue,
        };
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let mtime_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis())
            .unwrap_or(0);
        out.push(DevFingerprint {
            id: p.id,
            sig: format!("{mtime_ms}-{}", meta.len()),
        });
    }
    Ok(out)
}

/// Read a UTF-8 file at `<dir>/<rel>` from a developer-chosen dev folder, with the
/// same containment guard as `resolve_plugin_asset`. `rel` is the plugin-relative
/// code/asset path (e.g. "myplugin/dist/index.js"). Read-only; nothing is written.
#[tauri::command]
pub fn dev_plugin_read(dir: String, rel: String) -> Result<String, String> {
    let canon_dir = fs::canonicalize(&dir).map_err(|e| e.to_string())?;
    let path = resolve_dev_path(&canon_dir, &rel)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Binary asset read at `<dir>/<rel>` from a developer-chosen dev folder, mirroring
/// `dev_plugin_read` but for non-UTF-8 assets a dev plugin ships (icons, fonts,
/// images). Dev plugins are loaded in place with no copy into `<app-data>/plugins`,
/// so they have no `/api/plugins/<id>/...` HTTP endpoint; the frontend uses this to
/// read an asset's bytes and turn them into an object URL. Read-only; same
/// containment guard (`rel` must not escape the dev dir).
#[tauri::command]
pub fn dev_plugin_read_bytes(dir: String, rel: String) -> Result<Vec<u8>, String> {
    let canon_dir = fs::canonicalize(&dir).map_err(|e| e.to_string())?;
    let path = resolve_dev_path(&canon_dir, &rel)?;
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn plugins_list(app: AppHandle) -> Result<Vec<InstalledPlugin>, String> {
    let dir = plugins_dir(&app)?;
    list_installed(&dir)
}

#[tauri::command]
pub fn plugin_read(app: AppHandle, id: String, file: String) -> Result<String, String> {
    let path = resolve_plugin_asset(&plugins_dir(&app)?, &id, &file)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Binary asset read (same guards as `plugin_read`), for non-UTF-8 assets a
/// plugin ships (icons, fonts) on desktop.
#[tauri::command]
pub fn plugin_read_bytes(app: AppHandle, id: String, file: String) -> Result<Vec<u8>, String> {
    let path = resolve_plugin_asset(&plugins_dir(&app)?, &id, &file)?;
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn plugin_remove(app: AppHandle, id: String) -> Result<(), String> {
    safe_id(&id)?;
    let dir = plugins_dir(&app)?;
    let target = dir.join(&id);
    let canon_base = fs::canonicalize(&dir).map_err(|e| e.to_string())?;
    let canon_target = fs::canonicalize(&target).map_err(|e| e.to_string())?;
    if canon_target == canon_base || !canon_target.starts_with(&canon_base) {
        return Err("invalid path".into());
    }
    fs::remove_dir_all(&canon_target).map_err(|e| e.to_string())
}

/// Unzip plugin `bytes` (zip-slip + zip-bomb safe) into `<app-data>/plugins/<id>/`,
/// the id being read from the archive's `manifest.json`. If `expected_id` is set the
/// manifest id must match it (no silent clobber of another plugin). Extraction is
/// staged in a unique temp dir then swapped, and the temp dir is cleaned up on any
/// failure, so a failed install never leaves debris. Single extraction implementation
/// shared by `plugin_install` (registry download) and `plugin_install_file` (local).
fn install_zip_bytes(
    app: &AppHandle,
    bytes: &[u8],
    expected_id: Option<&str>,
) -> Result<InstalledPlugin, String> {
    let mut zip =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;

    // Read the manifest to learn the id (which names the install dir).
    let manifest: serde_json::Value = {
        let mut mf = zip
            .by_name("manifest.json")
            .map_err(|_| "manifest.json missing from archive".to_string())?;
        let mut s = String::new();
        mf.read_to_string(&mut s).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).map_err(|e| format!("bad manifest.json: {e}"))?
    };
    let id = manifest
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    safe_id(&id)?;
    if let Some(exp) = expected_id {
        if id != exp {
            return Err(format!("manifest id '{id}' != advertised '{exp}'"));
        }
    }

    let dir = plugins_dir(app)?;
    let dest = dir.join(&id);
    // Unique staging dir so concurrent/retried installs never collide.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = dir.join(format!(".tmp-{id}-{nanos}"));

    // Extract into the staging dir, capping cumulative decompressed bytes.
    let mut extract = || -> Result<(), String> {
        if zip.len() > MAX_ENTRIES {
            return Err("too many entries in archive".into());
        }
        fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
        let mut total: u64 = 0;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            // zip-slip guard: enclosed_name() is None for `..`/absolute paths.
            let Some(rel) = entry.enclosed_name() else {
                return Err("unsafe path in archive".into());
            };
            // Reject symlink entries (S_IFLNK): an archived link could point
            // outside the plugin dir even when its name is in-bounds.
            if let Some(mode) = entry.unix_mode() {
                if mode & 0o170000 == 0o120000 {
                    return Err("symlinks not allowed in archive".into());
                }
            }
            let out = tmp.join(rel);
            if entry.is_dir() {
                fs::create_dir_all(&out).map_err(|e| e.to_string())?;
                continue;
            }
            let budget = MAX_DECOMPRESSED_BYTES - total;
            if entry.size() > budget {
                return Err("plugin contents too large".into());
            }
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut f = fs::File::create(&out).map_err(|e| e.to_string())?;
            // take() bounds the actual bytes even if the declared size lied.
            let n = std::io::copy(&mut (&mut entry).take(budget), &mut f)
                .map_err(|e| e.to_string())?;
            total += n;
            if total >= MAX_DECOMPRESSED_BYTES {
                return Err("plugin contents too large".into());
            }
        }
        // Swap the staged dir into place.
        if dest.exists() {
            fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp, &dest).map_err(|e| e.to_string())
    };

    if let Err(e) = extract() {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }

    Ok(InstalledPlugin { id, manifest })
}

/// Download a plugin zip, verify its SHA-256, and install it. `expected_id` is the
/// registry-advertised id; the manifest id inside the zip must match it.
#[tauri::command]
pub async fn plugin_install(
    app: AppHandle,
    url: String,
    sha256: String,
    expected_id: String,
) -> Result<InstalledPlugin, String> {
    if !url.starts_with("https://") {
        return Err("plugin url must be https".into());
    }
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("download failed: HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > MAX_PLUGIN_BYTES {
        return Err("plugin archive too large".into());
    }

    // Integrity: the archive must match the registry-published checksum.
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if !digest.eq_ignore_ascii_case(sha256.trim()) {
        return Err("checksum mismatch".into());
    }

    install_zip_bytes(&app, bytes.as_ref(), Some(&expected_id))
}

/// Validate a frontend-supplied local path BEFORE reading it. The `path` is picked
/// via the native dialog, but it arrives as an untrusted string over the IPC bridge,
/// so harden against special/non-regular files: reject embedded NULs (silently
/// truncated by the C layer), symlinks (could point at anything), and anything that
/// is not a plain regular file (/dev/zero -> infinite read, FIFO -> blocks forever,
/// directories, sockets, block/char devices). `symlink_metadata` does NOT follow the
/// final symlink, so a symlinked path is caught here rather than dereferenced.
fn validate_plugin_path(path: &str) -> Result<(), String> {
    if path.contains('\0') {
        return Err("invalid path".into());
    }
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if meta.file_type().is_symlink() {
        return Err("symlinks not allowed".into());
    }
    if !meta.is_file() {
        return Err("not a regular file".into());
    }
    Ok(())
}

/// Install a plugin from a local `plugin.zip` the user picked on disk (the developer
/// path: test your own build without the registry). The id is derived from the zip's
/// manifest. `path` must be an existing regular file and obey the same compressed-size
/// cap as a download; extraction uses the same hardened helper.
#[tauri::command]
pub fn plugin_install_file(app: AppHandle, path: String) -> Result<InstalledPlugin, String> {
    // Reject symlinks / special files / non-regular files before touching the bytes.
    validate_plugin_path(&path)?;
    // Single read: check the resulting slice length, not a prior metadata() call.
    // This closes the TOCTOU window — there is no stat-then-read gap a concurrent
    // process could exploit to grow/truncate/swap the file between the size check
    // and the read. fs::read also bounds memory because the whole file lands in one
    // buffer, but the slice-length guard is what enforces MAX_PLUGIN_BYTES.
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_PLUGIN_BYTES {
        return Err("plugin archive too large".into());
    }
    // Local install: trust the zip's own manifest id (no advertised id to match).
    install_zip_bytes(&app, &bytes, None)
}

