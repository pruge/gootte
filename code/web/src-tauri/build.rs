use std::path::Path;

fn main() {
    // 빌드 시점의 저장소 뿌리를 바이너리에 새긴다 — 완성된 .app 을 Finder 에서
    // 곧바로 띄웠을 때(래퍼 스크립트·env 없는 실행) 저장소를 찾는 최후의 수단.
    // 기계 로컬 빌드 산물이므로 절대경로가 새겨지는 것이 맞고, 런타임 env
    // GOOTTE_TAURI_ROOT 가 항상 이 값보다 우선한다.
    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR set by cargo");
    let root = Path::new(&manifest_dir)
        .join("../../..") // src-tauri → web → code → 저장소 뿌리
        .canonicalize()
        .expect("repo root (three levels above src-tauri) exists");
    println!("cargo:rustc-env=GOOTTE_BUILD_ROOT={}", root.display());
    tauri_build::build()
}
