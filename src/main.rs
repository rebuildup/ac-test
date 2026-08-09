use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    env,
    fs,
    net::{IpAddr, Ipv4Addr, SocketAddr},
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Clone)]
struct AppState {
    root: Arc<PathBuf>,
}

#[derive(Debug, Deserialize)]
struct SampleCase {
    name: String,
    input: String,
    output: String,
}

#[derive(Debug, Deserialize)]
struct GeneratedCase {
    name: String,
    input: String,
}

#[derive(Debug, Deserialize)]
struct TestcaseRequest {
    contest: String,
    task: String,
    url: String,
    timelimit: String,
    cases: Vec<SampleCase>,
    #[serde(default)]
    generated: Vec<GeneratedCase>,
}

#[derive(Debug, Serialize)]
struct SaveResponse {
    ok: bool,
    path: String,
    cases: usize,
    generated: usize,
}

#[derive(Serialize)]
struct ErrorResponse {
    ok: bool,
    error: String,
}

#[tokio::main]
async fn main() {
    let root = parse_root();
    let port = parse_port();

    println!("ac-test");
    println!("root: {}", root.display());
    println!("listen: http://127.0.0.1:{port}");
    println!();

    let state = AppState {
        root: Arc::new(root),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/testcases", post(save_testcases))
        .with_state(state);

    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind localhost");

    axum::serve(listener, app).await.expect("server failed");
}

fn parse_root() -> PathBuf {
    let mut args = env::args().skip(1);

    while let Some(arg) = args.next() {
        if arg == "--root" {
            return PathBuf::from(args.next().expect("--root requires a path"));
        }
        if let Some(value) = arg.strip_prefix("--root=") {
            return PathBuf::from(value);
        }
    }

    PathBuf::from("..")
}

fn parse_port() -> u16 {
    let mut args = env::args().skip(1);

    while let Some(arg) = args.next() {
        if arg == "--port" {
            return args
                .next()
                .expect("--port requires a number")
                .parse()
                .expect("invalid --port");
        }
        if let Some(value) = arg.strip_prefix("--port=") {
            return value.parse().expect("invalid --port");
        }
    }

    27121
}

async fn health() -> &'static str {
    "ok"
}

async fn save_testcases(
    State(state): State<AppState>,
    Json(req): Json<TestcaseRequest>,
) -> impl IntoResponse {
    match write_testcases(&state.root, &req) {
        Ok(path) => (
            StatusCode::OK,
            Json(SaveResponse {
                ok: true,
                path: path.display().to_string(),
                cases: req.cases.len(),
                generated: req.generated.len(),
            }),
        )
            .into_response(),
        Err(message) => (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                ok: false,
                error: message,
            }),
        )
            .into_response(),
    }
}

fn write_testcases(root: &Path, req: &TestcaseRequest) -> Result<PathBuf, String> {
    validate_slug(&req.contest, "contest")?;
    validate_slug(&req.task, "task")?;

    if req.cases.is_empty() {
        return Err("no sample cases were found".into());
    }

    let contest_dir = resolve_contest_dir(root, &req.contest)?;
    let testcases_dir = contest_dir.join("testcases");
    fs::create_dir_all(&testcases_dir)
        .map_err(|e| format!("failed to create {}: {e}", testcases_dir.display()))?;

    let alias = task_alias(&req.contest, &req.task)?;
    let yaml_path = testcases_dir.join(format!("{alias}.yml"));
    fs::write(&yaml_path, render_yaml(req))
        .map_err(|e| format!("failed to write {}: {e}", yaml_path.display()))?;

    Ok(yaml_path)
}

fn resolve_contest_dir(root: &Path, contest: &str) -> Result<PathBuf, String> {
    if root.file_name().and_then(|x| x.to_str()) == Some(contest) {
        return Ok(root.to_path_buf());
    }

    let direct = root.join(contest);
    if direct.is_dir() {
        return Ok(direct);
    }

    Err(format!(
        "contest directory not found: expected {} or --root itself to be named {}",
        direct.display(),
        contest
    ))
}

fn validate_slug(value: &str, label: &str) -> Result<(), String> {
    let valid = !value.is_empty()
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-');

    if valid {
        Ok(())
    } else {
        Err(format!("invalid {label}: {value:?}"))
    }
}

fn task_alias(contest: &str, task: &str) -> Result<String, String> {
    let prefix = format!("{contest}_");
    let alias = task
        .strip_prefix(&prefix)
        .or_else(|| task.rsplit_once('_').map(|(_, suffix)| suffix))
        .unwrap_or(task);

    validate_slug(alias, "task alias")?;
    Ok(alias.to_ascii_lowercase())
}

fn render_yaml(req: &TestcaseRequest) -> String {
    let mut yaml = String::new();

    yaml.push_str("# ");
    yaml.push_str(&req.url);
    yaml.push('\n');
    yaml.push_str("---\n");
    yaml.push_str("type: Batch\n");
    yaml.push_str("timelimit: ");
    yaml.push_str(&normalize_timelimit(&req.timelimit));
    yaml.push('\n');
    yaml.push_str("match: Lines\n\n");
    yaml.push_str("cases:\n");

    for case in &req.cases {
        yaml.push_str("  - name: ");
        yaml.push_str(&yaml_plain_scalar(&case.name));
        yaml.push('\n');
        yaml.push_str("    in: |\n");
        push_block(&mut yaml, &case.input, 6);
        yaml.push_str("    out: |\n");
        push_block(&mut yaml, &case.output, 6);
    }

    // cargo-compete Case.out is optional. Generated Level-1 cases deliberately
    // omit `out`, so `cargo compete test` still enforces timeout/runtime errors
    // without pretending we know the correct answer for generated inputs.
    for case in &req.generated {
        yaml.push_str("  - name: generated-");
        yaml.push_str(&yaml_plain_scalar(&case.name));
        yaml.push('\n');
        yaml.push_str("    in: |\n");
        push_block(&mut yaml, &case.input, 6);
    }

    yaml.push_str("\nextend: []\n");
    yaml
}

fn normalize_timelimit(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "2s".into()
    } else if trimmed.ends_with('s') {
        trimmed.into()
    } else {
        format!("{trimmed}s")
    }
}

fn yaml_plain_scalar(value: &str) -> String {
    if value
        .bytes()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-' | b'.'))
        && !value.is_empty()
    {
        value.into()
    } else {
        format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
    }
}

fn push_block(out: &mut String, value: &str, spaces: usize) {
    let indent = " ".repeat(spaces);
    let normalized = value.replace("\r\n", "\n").replace('\r', "\n");
    let normalized = normalized.trim_end_matches('\n');

    if normalized.is_empty() {
        out.push_str(&indent);
        out.push('\n');
        return;
    }

    for line in normalized.split('\n') {
        out.push_str(&indent);
        out.push_str(line);
        out.push('\n');
    }
}
