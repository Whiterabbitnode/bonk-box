// How many times you got heated at your agents.
//
// PRIVACY, because you should ask.
//
// This reads your coding-session transcripts, which are already sitting on
// this machine, and it keeps ONE NUMBER PER DAY. Never a line of text, never
// an excerpt, never a file name, never a project name, never a prompt. The
// matching happens here in memory against the same plain word list the hook
// script uses, and the text is dropped the instant the line has been read.
//
// The only things written to disk are:
//
//   ~/.config/bonk-box/heat/tally.json   dates and counts, nothing else
//   ~/.config/bonk-box/heat/cursor.json  how far each file has been read,
//                                        keyed by a hash of its path so not
//                                        even the paths are recorded
//
// Nothing leaves this machine. There is no network call anywhere in this file.
// Turn the whole thing off with "heatTracking": false in config.json, or a
// single source off with "heatSources".
//
// The word list is embedded from hooks/heated-words.txt at build time so the
// scanner and the hook always agree. Drop your own list at
// ~/.config/bonk-box/heated-words.txt to override it.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager};

/// The same list the hook matches against, so a word means the same thing
/// whether he noticed it live or found it later.
const BUILTIN_WORDS: &str = include_str!("../../../hooks/heated-words.txt");

/// How long a single pass is allowed to work before it goes back to sleep.
/// There are tens of thousands of transcripts here; the point is that you
/// never notice this running.
const SLICE_SECS: u64 = 4;
/// Between passes while there is still ground to cover, and once caught up.
const BUSY_GAP_SECS: u64 = 30;
const IDLE_GAP_SECS: u64 = 600;

/// Which transcripts he reads. Adding a source is adding a row here plus an
/// extractor arm - the config array names them, so a new one can ship off by
/// default without touching anything else.
#[derive(Clone, Copy, PartialEq)]
enum Shape {
    ClaudeCode,
    CodexCli,
}

struct Source {
    id: &'static str,
    /// Relative to $HOME, so nothing absolute is baked in.
    root: &'static str,
    /// A cheap substring every interesting line contains. Lines without it are
    /// never parsed, which is what keeps a gigabytes-wide sweep affordable.
    marker: &'static str,
    shape: Shape,
    /// Whether this source is counted unless config says otherwise.
    default_on: bool,
}

const SOURCES: &[Source] = &[
    Source {
        id: "claude-code",
        root: ".claude/projects",
        marker: "\"type\":\"user\"",
        shape: Shape::ClaudeCode,
        default_on: true,
    },
    // Off unless you ask for it, and the reason is honesty rather than taste.
    // Codex transcripts do not record where a prompt came from, and a fleet
    // dispatching one instruction to fifty parallel sessions writes it into
    // fifty files - measured here, 454 matches from 110 distinct prompts, one
    // of them landing in 76 separate transcripts. Claude Code labels its
    // prompts, so the same measurement there was 221 matches from 217
    // distinct prompts. Counting your agents' arguments as your own temper
    // would make the number a lie, so this one waits to be switched on.
    Source {
        id: "codex-cli",
        root: ".codex/sessions",
        marker: "\"role\":\"user\"",
        shape: Shape::CodexCli,
        default_on: false,
    },
];

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn heat_dir() -> Option<PathBuf> {
    home().map(|h| h.join(".config/bonk-box/heat"))
}

fn config_value() -> serde_json::Value {
    home()
        .map(|h| h.join(".config/bonk-box/config.json"))
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or(serde_json::Value::Null)
}

/// Off is off: no walking, no reading, no counting.
pub fn tracking_enabled() -> bool {
    config_value()
        .get("heatTracking")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

fn source_enabled(source: &Source) -> bool {
    let cfg = config_value();
    let Some(list) = cfg.get("heatSources").and_then(|v| v.as_array()) else {
        return source.default_on;
    };
    for entry in list {
        if entry.get("id").and_then(|v| v.as_str()) == Some(source.id) {
            return entry
                .get("enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(source.default_on);
        }
    }
    source.default_on
}

/* ---- the word list ---------------------------------------------------- */

fn words() -> Vec<String> {
    let custom = home()
        .map(|h| h.join(".config/bonk-box/heated-words.txt"))
        .and_then(|p| std::fs::read_to_string(p).ok());
    let raw = custom.unwrap_or_else(|| BUILTIN_WORDS.to_string());
    raw.lines()
        .map(|l| l.trim().to_lowercase())
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .collect()
}

/// WHOLE WORDS ONLY, the same way the hook does it. A substring match here is
/// catastrophic: "hell" lives inside "shell" and every ordinary coding session
/// would read as rage. Punctuation becomes spaces, the text is padded, and
/// each entry is matched between spaces - which also keeps the multi-word
/// phrases working with no escaping.
fn reads_heated(text: &str, words: &[String]) -> bool {
    let mut padded = String::with_capacity(text.len() + 2);
    padded.push(' ');
    let mut last_space = true;
    for ch in text.chars() {
        if ch.is_alphanumeric() {
            for lower in ch.to_lowercase() {
                padded.push(lower);
            }
            last_space = false;
        } else if !last_space {
            padded.push(' ');
            last_space = true;
        }
    }
    if !last_space {
        padded.push(' ');
    }
    words
        .iter()
        .any(|w| padded.contains(&format!(" {} ", w)))
}

/* ---- dates ------------------------------------------------------------ */

/// Local offset from UTC in seconds, read once. Asking `date` per message
/// would cost more than the scan itself.
fn utc_offset_secs() -> i64 {
    let out = std::process::Command::new("date").arg("+%z").output().ok();
    let raw = out
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();
    // "+hhmm" or "-hhmm"
    if raw.len() < 5 {
        return 0;
    }
    let sign = if raw.starts_with('-') { -1 } else { 1 };
    let hh: i64 = raw[1..3].parse().unwrap_or(0);
    let mm: i64 = raw[3..5].parse().unwrap_or(0);
    sign * (hh * 3600 + mm * 60)
}

/// Days since 1970-01-01 from a civil date, and back again. Hinnant's
/// algorithms, so no calendar dependency for what is ultimately a date label.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = (mp + 2) % 12 + 1;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn day_label(days: i64) -> String {
    let (y, m, d) = civil_from_days(days);
    format!("{:04}-{:02}-{:02}", y, m, d)
}

/// "2026-07-31T22:42:39.717Z" -> the local day it happened on.
fn local_day_from_iso(ts: &str, offset: i64) -> Option<i64> {
    let bytes = ts.as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    let num = |a: usize, b: usize| ts.get(a..b).and_then(|s| s.parse::<i64>().ok());
    let (y, mo, d) = (num(0, 4)?, num(5, 7)?, num(8, 10)?);
    let (h, mi, s) = (num(11, 13)?, num(14, 16)?, num(17, 19)?);
    // Trailing Z means UTC; anything else is already local in practice.
    let utc = ts.ends_with('Z');
    let secs = days_from_civil(y, mo, d) * 86400 + h * 3600 + mi * 60 + s;
    Some((if utc { secs + offset } else { secs }).div_euclid(86400))
}

fn today_local() -> i64 {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    (now + utc_offset_secs()).div_euclid(86400)
}

/* ---- what counts as you talking --------------------------------------- */

/// Most "user" records in a transcript are not you. Tool results, injected
/// context, messages from other agents and the editor's own housekeeping
/// prompts all wear the same role. Counting those would turn a joke about
/// your temper into a joke about your tooling's.
fn is_injected(text: &str) -> bool {
    let t = text.trim_start();
    // Anything opening with a tag is context the harness wrapped and handed
    // over - environment blocks, hook prompts, notifications, another agent
    // talking. Naming them one at a time lost to the next one that appeared;
    // nobody starts a sentence they typed in anger with an angle bracket.
    if t.starts_with('<') {
        return true;
    }
    const PREFIXES: &[&str] = &[
        "You are ", // an agent being handed its character, not you talking
        "Another Claude session sent a message:",
        "Caveat: The messages below",
        "# AGENTS.md instructions",
        "Automation:",
    ];
    PREFIXES.iter().any(|p| t.starts_with(p))
}

/// Injected context is appended to real prompts too, so cut those blocks out
/// before matching rather than throwing the whole message away.
fn strip_reminders(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("<system-reminder>") {
        out.push_str(&rest[..start]);
        match rest[start..].find("</system-reminder>") {
            Some(end) => rest = &rest[start + end + "</system-reminder>".len()..],
            None => return out,
        }
    }
    out.push_str(rest);
    out
}

/// Pull the text YOU typed out of one transcript line, or nothing.
fn typed_text(line: &str, shape: Shape) -> Option<(String, String)> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    match shape {
        Shape::ClaudeCode => {
            if v.get("type")?.as_str()? != "user" {
                return None;
            }
            // A subagent's prompt is the fleet talking to itself.
            if v.get("isSidechain").and_then(|b| b.as_bool()).unwrap_or(false) {
                return None;
            }
            let text = v.get("message")?.get("content")?.as_str()?;
            // Newer transcripts label where a prompt came from, which is
            // exact. Older ones predate the field, so fall back to shape.
            match v.get("promptSource").and_then(|s| s.as_str()) {
                Some("typed") | Some("queued") => {}
                Some(_) => return None,
                None => {
                    if is_injected(text) {
                        return None;
                    }
                }
            }
            let ts = v.get("timestamp")?.as_str()?.to_string();
            Some((strip_reminders(text), ts))
        }
        Shape::CodexCli => {
            if v.get("type")?.as_str()? != "response_item" {
                return None;
            }
            let p = v.get("payload")?;
            if p.get("type")?.as_str()? != "message" || p.get("role")?.as_str()? != "user" {
                return None;
            }
            let ts = v.get("timestamp")?.as_str()?.to_string();
            let mut joined = String::new();
            for item in p.get("content")?.as_array()? {
                if let Some(t) = item.get("text").and_then(|t| t.as_str()) {
                    if is_injected(t) {
                        return None;
                    }
                    joined.push_str(t);
                    joined.push(' ');
                }
            }
            if joined.trim().is_empty() {
                return None;
            }
            Some((joined, ts))
        }
    }
}

/* ---- what is kept ----------------------------------------------------- */

/// Counts per day, and nothing else. `live` is what he saw happen while he was
/// running; `scanned` is what the transcripts say. They describe the same
/// moments from two angles, so a day takes the larger of the two rather than
/// the sum - the hook is throttled and can miss, the scan lags behind, and
/// adding them would count one bad afternoon twice.
#[derive(Default)]
struct Tally {
    live: HashMap<i64, u64>,
    scanned: HashMap<i64, u64>,
}

impl Tally {
    fn on(&self, day: i64) -> u64 {
        let l = self.live.get(&day).copied().unwrap_or(0);
        let s = self.scanned.get(&day).copied().unwrap_or(0);
        l.max(s)
    }
    fn totals(&self) -> (u64, u64, u64) {
        let today = today_local();
        let mut week = 0;
        let mut all = 0;
        let mut days: Vec<i64> = self.live.keys().chain(self.scanned.keys()).copied().collect();
        days.sort_unstable();
        days.dedup();
        for d in days {
            let n = self.on(d);
            all += n;
            if d > today - 7 && d <= today {
                week += n;
            }
        }
        (self.on(today), week, all)
    }
}

fn tally_path() -> Option<PathBuf> {
    heat_dir().map(|d| d.join("tally.json"))
}
fn cursor_path() -> Option<PathBuf> {
    heat_dir().map(|d| d.join("cursor.json"))
}

fn read_day_map(v: Option<&serde_json::Value>) -> HashMap<i64, u64> {
    let mut out = HashMap::new();
    let Some(obj) = v.and_then(|v| v.as_object()) else {
        return out;
    };
    for (k, n) in obj {
        let parts: Vec<i64> = k.split('-').filter_map(|p| p.parse().ok()).collect();
        if parts.len() == 3 {
            if let Some(n) = n.as_u64() {
                out.insert(days_from_civil(parts[0], parts[1], parts[2]), n);
            }
        }
    }
    out
}

fn load_tally() -> Tally {
    let Some(raw) = tally_path().and_then(|p| std::fs::read_to_string(p).ok()) else {
        return Tally::default();
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return Tally::default();
    };
    Tally {
        live: read_day_map(v.get("live")),
        scanned: read_day_map(v.get("scanned")),
    }
}

fn save_tally(t: &Tally) {
    let Some(dir) = heat_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let to_obj = |m: &HashMap<i64, u64>| {
        let mut o = serde_json::Map::new();
        for (d, n) in m {
            o.insert(day_label(*d), serde_json::json!(n));
        }
        o
    };
    let body = serde_json::json!({
        "v": 1,
        "note": "counts per day only - no text, no excerpts, no paths",
        "live": to_obj(&t.live),
        "scanned": to_obj(&t.scanned),
    });
    if let Some(p) = tally_path() {
        let _ = std::fs::write(p, body.to_string());
    }
}

static TALLY: Mutex<Option<Tally>> = Mutex::new(None);

fn with_tally<R>(f: impl FnOnce(&mut Tally) -> R) -> R {
    let mut guard = TALLY.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        *guard = Some(load_tally());
    }
    f(guard.as_mut().expect("tally loaded"))
}

/* ---- where each file has been read up to ------------------------------ */

/// A path hashed, never a path stored. Enough to know a file has not changed;
/// not enough to say anything about what you were working on.
fn path_key(p: &Path) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in p.as_os_str().as_encoded_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100_0000_01b3);
    }
    format!("{:016x}", h)
}

type Cursor = HashMap<String, (u64, u64)>;

fn load_cursor() -> Cursor {
    let mut out = HashMap::new();
    let Some(raw) = cursor_path().and_then(|p| std::fs::read_to_string(p).ok()) else {
        return out;
    };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return out;
    };
    if let Some(files) = v.get("files").and_then(|f| f.as_object()) {
        for (k, pair) in files {
            if let Some(a) = pair.as_array() {
                if a.len() == 2 {
                    let len = a[0].as_u64().unwrap_or(0);
                    let mtime = a[1].as_u64().unwrap_or(0);
                    out.insert(k.clone(), (len, mtime));
                }
            }
        }
    }
    out
}

fn save_cursor(c: &Cursor) {
    let Some(dir) = heat_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let mut files = serde_json::Map::new();
    for (k, (len, mtime)) in c {
        files.insert(k.clone(), serde_json::json!([len, mtime]));
    }
    let body = serde_json::json!({
        "v": 1,
        "note": "how far each transcript has been read, keyed by a hash of its path",
        "files": files,
    });
    if let Some(p) = cursor_path() {
        let _ = std::fs::write(p, body.to_string());
    }
}

/* ---- the sweep -------------------------------------------------------- */

fn collect_jsonl(root: &Path, out: &mut Vec<PathBuf>, deadline: Instant) {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if Instant::now() >= deadline {
            return;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            match entry.file_type() {
                Ok(t) if t.is_dir() => stack.push(path),
                Ok(t) if t.is_file() => {
                    if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                        out.push(path);
                    }
                }
                _ => {}
            }
        }
    }
}

/// Read one file from where we left off. Returns how many heated moments were
/// found, per local day.
fn scan_file(
    path: &Path,
    from: u64,
    shape: Shape,
    marker: &str,
    words: &[String],
    offset: i64,
    found: &mut HashMap<i64, u64>,
    deadline: Instant,
) -> bool {
    let Ok(file) = std::fs::File::open(path) else {
        return false;
    };
    let mut reader = BufReader::with_capacity(64 * 1024, file);
    if from > 0 && reader.seek(SeekFrom::Start(from)).is_err() {
        return false;
    }
    let mut line = String::new();
    let mut since_check = 0u32;
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        since_check += 1;
        if since_check >= 400 {
            since_check = 0;
            if Instant::now() >= deadline {
                // Stopping mid-file is fine: the cursor is only advanced on a
                // clean finish, so the rest is picked up next pass.
                return false;
            }
        }
        // The cheap gate. Most lines are tool traffic and never get parsed.
        if !line.contains(marker) {
            continue;
        }
        let Some((text, ts)) = typed_text(&line, shape) else {
            continue;
        };
        if !reads_heated(&text, words) {
            continue;
        }
        if let Some(day) = local_day_from_iso(&ts, offset) {
            *found.entry(day).or_insert(0) += 1;
        }
    }
    true
}

/// One pass, time-boxed. Returns true if there is likely more to do.
fn scan_slice() -> bool {
    let deadline = Instant::now() + Duration::from_secs(SLICE_SECS);
    let Some(home) = home() else { return false };
    let words = words();
    let offset = utc_offset_secs();
    let mut cursor = load_cursor();
    let mut found: HashMap<i64, u64> = HashMap::new();
    let mut touched = 0u32;
    let mut more = false;

    for source in SOURCES {
        if !source_enabled(source) {
            continue;
        }
        let root = home.join(source.root);
        if !root.exists() {
            continue;
        }
        let mut files = Vec::new();
        collect_jsonl(&root, &mut files, deadline);
        for path in files {
            if Instant::now() >= deadline {
                more = true;
                break;
            }
            let Ok(meta) = std::fs::metadata(&path) else {
                continue;
            };
            let len = meta.len();
            let mtime = meta
                .modified()
                .ok()
                .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let key = path_key(&path);
            let seen = cursor.get(&key).copied();
            if seen == Some((len, mtime)) {
                continue; // untouched since last time
            }
            // A file that shrank was replaced, so start it again.
            let from = match seen {
                Some((prev, _)) if prev <= len => prev,
                _ => 0,
            };
            let finished = scan_file(
                &path,
                from,
                source.shape,
                source.marker,
                &words,
                offset,
                &mut found,
                deadline,
            );
            if finished {
                cursor.insert(key, (len, mtime));
            } else {
                more = true;
            }
            touched += 1;
            // Stay out of the way of whatever you are actually doing.
            if touched % 8 == 0 {
                std::thread::sleep(Duration::from_millis(1));
            }
        }
    }

    if !found.is_empty() {
        with_tally(|t| {
            for (day, n) in &found {
                *t.scanned.entry(*day).or_insert(0) += n;
            }
            save_tally(t);
        });
    }
    if touched > 0 {
        save_cursor(&cursor);
    }
    more || touched > 0
}

/* ---- the outside world ------------------------------------------------ */

/// He saw it happen. One more for today.
pub fn note_heated(app: &AppHandle) {
    if !tracking_enabled() {
        return;
    }
    let today = today_local();
    with_tally(|t| {
        *t.live.entry(today).or_insert(0) += 1;
        save_tally(t);
    });
    push(app);
}

fn numbers() -> (u64, u64, u64) {
    with_tally(|t| t.totals())
}

/// Hand the page its three numbers. It draws them; it is never told anything
/// else, because there is nothing else to tell.
pub fn push(app: &AppHandle) {
    if !tracking_enabled() {
        return;
    }
    let (today, week, all) = numbers();
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.eval(&format!(
            "window.Bonk&&Bonk.Heat&&Bonk.Heat.set({},{},{})",
            today, week, all
        ));
    }
    let _ = app.emit("bonk-heat", (today, week, all));
}

#[tauri::command]
pub fn heat_tally(app: AppHandle) -> (u64, u64, u64) {
    let _ = &app;
    if !tracking_enabled() {
        return (0, 0, 0);
    }
    numbers()
}

/// Quietly, in the background, for as long as he is running.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        // Let the page exist and the launch settle before touching any disk.
        std::thread::sleep(Duration::from_secs(6));
        loop {
            if !tracking_enabled() {
                std::thread::sleep(Duration::from_secs(IDLE_GAP_SECS));
                continue;
            }
            let busy = scan_slice();
            push(&app);
            std::thread::sleep(Duration::from_secs(if busy {
                BUSY_GAP_SECS
            } else {
                IDLE_GAP_SECS
            }));
        }
    });
}
