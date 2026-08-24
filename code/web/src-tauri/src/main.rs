//! gootte 데스크톱 셸(tauri-desktop-app T01).
//!
//! 창은 얇다: 로컬 스택(hono backend ↔ vite frontend)을 자식 프로세스로 띄우고,
//! 둘 다 포트를 열면 그때 창을 보여 주며(http://localhost:<frontend>), 닫히면
//! 자식을 몰아 정리한다. UI 는 순수 http(same-origin fetch · WS /api/live)라
//! IPC 를 하나도 쓰지 않는다 — 셸이 하는 일은 이 수명 관리가 전부다.

use std::{
    net::TcpStream,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use tauri::{RunEvent, WebviewUrl, WebviewWindowBuilder};

struct ManagedChild {
    name: &'static str,
    child: Child,
}

/// 자식 프로세스 등록부 — 창 닫힘·시그널·감시 스레드 어디서 정리하든 이 한 곳을 본다.
static CHILDREN: OnceLock<Mutex<Vec<ManagedChild>>> = OnceLock::new();

fn registry() -> &'static Mutex<Vec<ManagedChild>> {
    CHILDREN.get().expect("자식 등록부는 main 에서 먼저 세운다")
}

/// 정리 경로(창 닫힘→ExitRequested→Exit·시그널·감시 스레드)가 겹쳐도 한 번만 돌게.
static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

/// 시그널 핸들러는 async-signal-safe 한 것만 한다 — 플래그 하나. 실제 정리는
/// 시그널 감시 스레드가 이벤트 루프와 무관하게 한다.
static SIGNALED: AtomicBool = AtomicBool::new(false);

extern "C" fn on_signal(_sig: i32) {
    SIGNALED.store(true, Ordering::SeqCst);
}

fn install_signal_handlers() {
    let handler = on_signal as extern "C" fn(i32) as *const () as usize;
    unsafe {
        libc::signal(libc::SIGINT, handler);
        libc::signal(libc::SIGTERM, handler);
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum FrontendMode {
    Dev,
    Preview,
}

impl FrontendMode {
    fn resolve() -> Result<Self, String> {
        if let Some(raw) = std::env::var_os("GOOTTE_TAURI_FRONTEND_MODE") {
            return match raw.to_string_lossy().as_ref() {
                "dev" => Ok(Self::Dev),
                "preview" => Ok(Self::Preview),
                other => Err(format!(
                    "GOOTTE_TAURI_FRONTEND_MODE 는 dev|preview 만 받는다(현재 '{other}')"
                )),
            };
        }
        // 래퍼 스크립트 없이 완성 .app 을 곧바로 띄운 실행(release)은 빌드된 dist 를
        // 서빙하는 vite preview, tauri dev(debug)는 HMR 있는 vite dev 서버로 간다 —
        // 페이지 오리진이 같아서 UI 코드 차이는 없다.
        if cfg!(debug_assertions) {
            Ok(Self::Dev)
        } else {
            Ok(Self::Preview)
        }
    }
}

struct StackConfig {
    root: PathBuf,
    backend_port: u16,
    frontend_port: u16,
    mode: FrontendMode,
}

fn logln(msg: &str) {
    eprintln!("gootte-desktop: {msg}");
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(std::env::temp_dir().join("gootte-tauri.log"))
    {
        use std::io::Write;
        let _ = writeln!(f, "[{stamp}] {msg}");
    }
}

fn kill_all() {
    SHUTTING_DOWN.store(true, Ordering::SeqCst);
    let mut guard = match registry().lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    for mc in guard.iter_mut() {
        let pid = mc.child.id();
        // SIGTERM 로 정상 종료(server.ts 핸들러가 감시자를 닫고 나간다)를 유도하고,
        // 3초 안에 안 나가면 SIGKILL 로 뒷받침한다. 자식이 단일 프로세스(tsx watch 의
        // supervisor+worker 가 아니다)라 시그널 하나로 충분하다.
        unsafe { libc::kill(pid as i32, libc::SIGTERM) };
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            match mc.child.try_wait() {
                Ok(Some(status)) => {
                    logln(&format!("stopped {} (pid {pid}, {status})", mc.name));
                    break;
                }
                Ok(None) if Instant::now() < deadline => {
                    thread::sleep(Duration::from_millis(50));
                }
                Ok(None) => {
                    let _ = mc.child.kill();
                    let _ = mc.child.wait();
                    logln(&format!("force-killed {} (pid {pid}) after grace", mc.name));
                    break;
                }
                Err(e) => {
                    logln(&format!("{} (pid {pid}) 대기 실패: {e}", mc.name));
                    break;
                }
            }
        }
    }
    guard.clear();
}

/// 치명 실패 — 조용한 폴백 없이 기록을 남기고 자식을 치운 뒤 죽는다.
fn fail_fatal(msg: &str) -> ! {
    logln(&format!("FATAL {msg}"));
    kill_all();
    std::process::exit(1);
}

fn looks_like_repo(root: &Path) -> bool {
    root.join("code/web/backend/src/server.ts").is_file() && root.join("scripts/ports.sh").is_file()
}

fn resolve_root() -> Result<PathBuf, String> {
    // 런타임 지정(GOOTTE_TAURI_ROOT)이 항상 이기고, 없으면 빌드 시점에 새긴 뿌리가
    // 최후의 수단이다 — 완성 앱을 Finder 에서 바로 띄워도 저장소를 찾게.
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(env_root) = std::env::var_os("GOOTTE_TAURI_ROOT") {
        candidates.push(PathBuf::from(env_root));
    }
    if let Some(built) = option_env!("GOOTTE_BUILD_ROOT") {
        candidates.push(PathBuf::from(built));
    }
    for candidate in &candidates {
        if looks_like_repo(candidate) {
            return candidate
                .canonicalize()
                .map_err(|e| format!("루트 해석 실패({}): {e}", candidate.display()));
        }
        logln(&format!(
            "루트 후보 거절(구조가 안 맞음): {}",
            candidate.display()
        ));
    }
    Err(
        "gootte 저장소 뿌리를 못 찾았다 — GOOTTE_TAURI_ROOT 환경변수에 저장소 최상위를 \
         가리켜라"
            .into(),
    )
}

/// scripts/ports.sh 의 판정 규칙과 동일 — worktree 값이 있으면 이기고 없으면 main 값.
/// 없음·빈 값·비숫자는 조용한 기본값 대신 큰 소리로 멈춘다.
fn extract_port(content: &str, key: &str) -> Result<u16, String> {
    let prefix = format!("{key}=");
    let value = content
        .lines()
        .rev()
        .find_map(|l| l.strip_prefix(&prefix))
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| format!("{key} 줄이 없거나 비었다"))?;
    value
        .parse::<u16>()
        .map_err(|_| format!("{key}='{value}' 는 숫자가 아니다"))
}

fn resolve_ports(root: &Path) -> Result<(u16, u16), String> {
    let dir = root.join("code/web");
    let worktree = dir.join(".ports.worktree");
    let main = dir.join(".ports.main");
    let (path, label) = if worktree.is_file() {
        (&worktree, "worktree")
    } else if main.is_file() {
        (&main, "main")
    } else {
        return Err(format!(
            "ports 파일이 없다 — {} 도 {} 도 없다",
            worktree.display(),
            main.display()
        ));
    };
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("{} 읽기 실패: {e}", path.display()))?;
    let backend = extract_port(&content, "BACKEND_PORT")
        .map_err(|e| format!("{label}({}): {e}", path.display()))?;
    let frontend = extract_port(&content, "FRONTEND_PORT")
        .map_err(|e| format!("{label}({}): {e}", path.display()))?;
    Ok((backend, frontend))
}

/// node 실행 파일 찾기 — GUI 실행(launchd)은 셸 PATH 를 물려받지 않으므로
/// GOOTTE_NODE → PATH → nvm → 알려진 위치 순으로 스스로 푼다.
fn resolve_node() -> Result<PathBuf, String> {
    if let Some(raw) = std::env::var_os("GOOTTE_NODE") {
        let p = PathBuf::from(raw);
        return if p.is_file() {
            Ok(p)
        } else {
            Err(format!("GOOTTE_NODE={} 가 파일이 아니다", p.display()))
        };
    }
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let candidate = dir.join("node");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let mut versions: Vec<PathBuf> = std::fs::read_dir(home.join(".nvm/versions/node"))
            .map(|rd| rd.flatten().map(|e| e.path()).collect())
            .unwrap_or_default();
        versions.sort_unstable_by(|a, b| b.cmp(a)); // 버전 문자열 내림차순 — 최근 릴리스 우선
        for dir in versions {
            let candidate = dir.join("bin/node");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    for candidate in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        let candidate = PathBuf::from(candidate);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err("node 실행 파일을 못 찾았다 — GOOTTE_NODE 환경변수에 node 절대경로를 지정해라".into())
}

/// 자식 stdout/stderr 를 셸 로그로 우겨 넣는다 — GUI 실행(launchd)에선 자식 출력이
/// 어디에도 안 보이므로, 이 포워딩이 유일한 관측 창이다.
fn forward_output(name: &'static str, stream: impl std::io::Read + Send + 'static) {
    thread::spawn(move || {
        let reader = std::io::BufReader::new(stream);
        for line in std::io::BufRead::lines(reader).map_while(Result::ok) {
            logln(&format!("[{name}] {line}"));
        }
    });
}

fn register_child(mc: ManagedChild) {
    registry()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .push(mc);
}

fn spawn_children(cfg: &StackConfig) -> Result<(), String> {
    let node = resolve_node()?;
    logln(&format!("node = {}", node.display()));

    let vite_js = cfg
        .root
        .join("code/web/frontend/node_modules/vite/bin/vite.js");
    if !vite_js.is_file() {
        return Err(format!(
            "{} 가 없다 — 먼저 `pnpm setup` 으로 의존성을 깔아라",
            vite_js.display()
        ));
    }
    if cfg.mode == FrontendMode::Preview {
        let dist = cfg.root.join("code/web/frontend/dist/index.html");
        if !dist.is_file() {
            return Err(format!(
                "{} 가 없다 — preview 모드는 프론트엔드 빌드 산물이 필요하다(`pnpm tauri:build` 를 써라)",
                dist.display()
            ));
        }
    }

    let mut backend_cmd = Command::new(&node);
    backend_cmd
        // tsx watch 가 아니라 단일 실행 — 셸의 SIGTERM 한 방으로 깨끗이 끊긴다.
        .args(["--import", "tsx", "src/server.ts"])
        .current_dir(cfg.root.join("code/web/backend"))
        .env("PORT", cfg.backend_port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut backend = backend_cmd
        .spawn()
        .map_err(|e| format!("backend(node --import tsx src/server.ts) 스폰 실패: {e}"))?;
    if let Some(out) = backend.stdout.take() {
        forward_output("backend", out);
    }
    if let Some(err) = backend.stderr.take() {
        forward_output("backend", err);
    }
    logln(&format!("backend spawned (pid {})", backend.id()));
    register_child(ManagedChild {
        name: "backend",
        child: backend,
    });

    let mut frontend_cmd = Command::new(&node);
    frontend_cmd.arg(&vite_js);
    if cfg.mode == FrontendMode::Preview {
        frontend_cmd.arg("preview");
    }
    frontend_cmd
        // localhost 바인딩은 macOS 에서 ::1(IPv6)만 잡히곤 한다 — 창·헬스체크와
        // 같은 패밀리(IPv4 루프백)로 고정해 두어야 오리진이 하나로 모인다.
        .args(["--host", "127.0.0.1"])
        .args(["--port", &cfg.frontend_port.to_string(), "--strictPort"])
        .current_dir(cfg.root.join("code/web/frontend"))
        .env(
            "VITE_BACKEND_URL",
            format!("http://localhost:{}", cfg.backend_port),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut frontend = frontend_cmd
        .spawn()
        .map_err(|e| format!("frontend(vite {:?}) 스폰 실패: {e}", cfg.mode))?;
    if let Some(out) = frontend.stdout.take() {
        forward_output("frontend", out);
    }
    if let Some(err) = frontend.stderr.take() {
        forward_output("frontend", err);
    }
    logln(&format!("frontend spawned (pid {})", frontend.id()));
    register_child(ManagedChild {
        name: "frontend",
        child: frontend,
    });

    Ok(())
}

fn wait_listening(port: u16, label: &str, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    loop {
        // 두 루프백 패밀리 모두 검사 — 바인딩 쪽 패밀리가 어느 쪽이든 truthy 다.
        let v4 = TcpStream::connect(("127.0.0.1", port)).is_ok();
        let v6 = TcpStream::connect(("::1", port)).is_ok();
        if v4 || v6 {
            logln(&format!(
                "{label} listening :{port} ({})",
                if v4 && v6 {
                    "ipv4+ipv6"
                } else if v4 {
                    "ipv4"
                } else {
                    "ipv6"
                }
            ));
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "{label} 가 {timeout:?} 안에 :{port} 를 열지 않았다 — 자식 출력을 확인해라"
            ));
        }
        thread::sleep(Duration::from_millis(250));
    }
}

fn main() {
    let mode = match FrontendMode::resolve() {
        Ok(m) => m,
        Err(e) => {
            logln(&format!("FATAL {e}"));
            std::process::exit(1);
        }
    };
    let cfg = match resolve_root().and_then(|root| {
        resolve_ports(&root).map(|(backend_port, frontend_port)| StackConfig {
            root,
            backend_port,
            frontend_port,
            mode,
        })
    }) {
        Ok(c) => c,
        Err(e) => {
            logln(&format!("FATAL {e}"));
            std::process::exit(1);
        }
    };
    logln(&format!(
        "root = {} · backend :{} · frontend :{} · mode = {:?}",
        cfg.root.display(),
        cfg.backend_port,
        cfg.frontend_port,
        cfg.mode
    ));

    if CHILDREN.set(Mutex::new(Vec::new())).is_err() {
        logln("FATAL 자식 등록부가 이미 세워져 있다");
        std::process::exit(1);
    }
    install_signal_handlers();

    // 시그널 감시 — Ctrl-C(tauri dev)·kill TERM 에도 자식이 고아로 남지 않게.
    // 이벤트 루프가 시그널을 알 수 없으므로 루프 밖 스레드가 정리를 주관한다.
    thread::spawn(|| loop {
        thread::sleep(Duration::from_millis(100));
        if SIGNALED.load(Ordering::SeqCst) {
            logln("시그널 수신 — 자식 정리 후 종료한다");
            kill_all();
            std::process::exit(0);
        }
    });

    tauri::Builder::default()
        .setup(move |app| {
            spawn_children(&cfg).unwrap_or_else(|e| fail_fatal(&e));

            wait_listening(cfg.backend_port, "backend", Duration::from_secs(20))
                .and_then(|()| {
                    wait_listening(cfg.frontend_port, "frontend", Duration::from_secs(20))
                })
                .unwrap_or_else(|e| fail_fatal(&e));

            // 둘 다 살아난 뒤에만 창을 만든다 — 반쯤 뜬 화면(stale 뷰)을 보여 주지 않게.
            // vite 를 127.0.0.1 로 고정했으니 오리진도 같은 패밀리로.
            let url: tauri::Url = format!("http://127.0.0.1:{}", cfg.frontend_port)
                .parse()
                .unwrap_or_else(|e| fail_fatal(&format!("UI URL 파싱 실패: {e}")));
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("gootte")
                .inner_size(1440.0, 900.0)
                .min_inner_size(960.0, 600.0)
                .visible(false)
                .build()
                .unwrap_or_else(|e| fail_fatal(&format!("창 생성 실패: {e}")));
            let _ = window.show();
            let _ = window.set_focus();

            // 자식 하나가 죽으면 화면은 조용히 낡는다(INV-3 위반 상태) — 통보 없이
            // 남겨 두지 않고 앱째로 내린다.
            thread::spawn(|| loop {
                thread::sleep(Duration::from_secs(2));
                if SHUTTING_DOWN.load(Ordering::SeqCst) {
                    return;
                }
                let dead = {
                    let mut guard = registry().lock().unwrap_or_else(|p| p.into_inner());
                    guard.iter_mut().find_map(|mc| {
                        mc.child
                            .try_wait()
                            .ok()
                            .flatten()
                            .map(|status| (mc.name, status.to_string()))
                    })
                };
                if let Some((name, status)) = dead {
                    fail_fatal(&format!(
                        "{name} 이 예상 밖으로 종료됐다({status}) — 앱을 내린다"
                    ));
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("tauri 앱 컨텍스트 빌드 실패")
        .run(|_app, event| match event {
            RunEvent::ExitRequested { code, .. } => {
                logln(&format!("종료 요청(code {code:?}) — 자식을 정리한다"));
                kill_all();
            }
            RunEvent::Exit => kill_all(), // 위에서 이미 돌었다면 멱등
            _ => {
                // 마지막 창이 닫히면 ExitRequested 가 따라 온다 — 여기서 할 일 없다.
            }
        });
}
