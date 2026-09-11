// proc-title.mjs — 프로세스 표시 이름 지정용 `--import` 모듈.
// node 는 `--title` 플래그가 없어 진입점 코드를 못 건드리는 실행(vite 바이너리 등)은
// 이 모듈을 `--import` 로 미리 로드해 `GOOTTE_PROC_TITLE` 을 `process.title` 에 앉힌다.
// Activity Monitor·ps 에 `node` 대신 지정한 이름으로 뜬다 (macOS 실측).
const title = process.env.GOOTTE_PROC_TITLE;
if (title) process.title = title;
