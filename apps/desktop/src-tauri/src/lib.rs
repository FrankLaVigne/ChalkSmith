use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};

#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("Could not read {path}: {e}"))
}

#[tauri::command]
fn write_atomic(request: Request<'_>) -> Result<(), String> {
    let raw = request
        .headers()
        .get("x-path")
        .ok_or("missing x-path header")?
        .to_str()
        .map_err(|e| e.to_string())?;
    let path = percent_encoding::percent_decode_str(raw)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    write_atomic_impl(Path::new(&path), bytes).map_err(|e| format!("Could not save {path}: {e}"))
}

/// Write to a temporary file in the same folder, flush to disk, then rename over the target.
pub fn write_atomic_impl(target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = target
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let name = target
        .file_name()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "no file name"))?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp: PathBuf = dir.join(format!(
        ".{}.tmp-{}-{}",
        name.to_string_lossy(),
        std::process::id(),
        nonce
    ));
    let result = (|| {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_file, write_atomic])
        .run(tauri::generate_context!())
        .expect("error while running ChalkSmith");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_replaces_and_leaves_no_temp_files() {
        let dir = std::env::temp_dir().join(format!("chalksmith-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("a.chalk");
        write_atomic_impl(&p, b"one").unwrap();
        write_atomic_impl(&p, b"two").unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"two");
        let leftovers = fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".tmp-"))
            .count();
        assert_eq!(leftovers, 0);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn fails_cleanly_when_folder_is_missing() {
        let p = std::env::temp_dir().join("chalksmith-no-such-dir-xyz").join("a.chalk");
        assert!(write_atomic_impl(&p, b"x").is_err());
    }
}
