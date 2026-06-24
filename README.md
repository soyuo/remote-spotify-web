# remote-spotify-web
`remote-spotify-web`는 브라우저에서 Spotify 재생을 원격으로 제어하는 로컬 웹 앱입니다.
노래를 검색하고, 바로 재생하거나 앱 내부 대기열에 추가할 수 있으며, 하단 플레이어 바에서 재생/일시정지, 이전/다음 곡, 탐색, 볼륨 조절을 수행합니다.

프론트엔드는 `React`와 `Vite`로 구성되어 있고, 백엔드는 `Express` 서버가 `Spotify Web API`를 호출하는 방식으로 동작합니다.

## 주요 기능

- Spotify 트랙 검색
- 검색 결과 단일 클릭으로 대기열 추가
- 검색 결과 더블 클릭으로 즉시 재생
- 현재 재생 곡, 재생 위치, 볼륨 상태 표시
- 재생/일시정지, 이전 곡, 다음 곡 제어
- 재생 위치 seek 및 볼륨 변경
- 앱 자체 대기열 관리
- 대기열 항목 단일 클릭 재생, 더블 클릭 제거
- `Server-Sent Events` 기반 실시간 플레이어 상태 동기화

## 기술 스택

- `React`
- `TypeScript`
- `Vite`
- `Express`
- `pnpm`

## 프로젝트 구조

```text
.
├─ api/
│  ├─ server.ts        # local API server, queue/player status
│  └─ spotify.ts       # Spotify credential, request API, track utility
├─ install/
│  └─ init.ts          # Spotify OAuth init
├─ scripts/
│  └─ dev.ts           # API & Vite
├─ src/
│  ├─ components/      # Search, Queue, Player UI component
│  ├─ pages/
│  │  └─ SearchPage.tsx
│  ├─ styles/
│  │  └─ global.css
│  └─ main.tsx
├─ spotify.config.example.json
├─ spotify.config.json # Local Spotify App Config
├─ spotify.json        # OAuth Token Storage
└─ package.json
```

## 사전 준비

1. Node.js가 필요합니다. 이 프로젝트는 `node --experimental-strip-types`로 TypeScript 파일을 직접 실행하므로 해당 옵션을 지원하는 최신 Node.js 환경을 권장합니다.
2. `pnpm`이 필요합니다.
3. Spotify Developer Dashboard에서 앱을 생성해야 합니다.
4. Spotify 앱의 Redirect URI에 아래 값을 등록해야 합니다.

```text
http://127.0.0.1:3000/api/auth/spotify/callback
```

## 설치

```bash
pnpm install
```

## Spotify 설정

`spotify.config.example.json`을 참고해 `spotify.config.json`을 작성합니다.

```json
{
  "clientId": "your_spotify_client_id",
  "clientSecret": "your_spotify_client_secret",
  "redirectUri": "http://127.0.0.1:3000/api/auth/spotify/callback",
  "scopes": [
    "user-read-private",
    "user-read-email",
    "streaming",
    "user-read-playback-state",
    "user-modify-playback-state"
  ],
  "market": "KR",
  "authBaseUrl": "https://accounts.spotify.com/authorize",
  "tokenUrl": "https://accounts.spotify.com/api/token",
  "apiBaseUrl": "https://api.spotify.com/v1"
}
```

필수 권한은 재생 상태 조회와 재생 상태 변경입니다.

- `user-read-playback-state`
- `user-modify-playback-state`
- `streaming`

## Spotify 인증 초기화

처음 한 번 아래 명령을 실행합니다.

```bash
pnpm spotify:init
```

스크립트는 임시 콜백 서버를 열고 Spotify 인증 URL을 브라우저로 엽니다. 로그인을 완료하면 발급받은 access token과 refresh token이 `spotify.json`에 저장됩니다.

이후 API 요청 시 access token 만료가 가까워지면 `api/spotify.ts`의 `getValidAccessToken`이 refresh token으로 자동 갱신합니다.

## 개발 서버 실행

```bash
pnpm dev
```

이 명령은 두 서버를 함께 실행합니다.

- API 서버: `http://127.0.0.1:3000`
- Vite 개발 서버: `http://127.0.0.1:5173`

Vite 서버는 `/api` 요청을 `http://127.0.0.1:3000`으로 프록시합니다.

개별 실행도 가능합니다.

```bash
pnpm dev:api
pnpm dev:web
```

## 빌드

```bash
pnpm build
```

TypeScript 프로젝트 빌드 후 Vite production build를 생성합니다.

빌드 결과를 확인하려면 다음 명령을 사용합니다.

```bash
pnpm preview
```

## 작동 흐름

1. 사용자가 검색어를 입력하고 제출합니다.
2. 프론트엔드가 `/api/search?query=...`를 호출합니다.
3. API 서버가 Spotify `/search` API를 호출하고 트랙 데이터를 앱에서 쓰기 쉬운 형태로 변환합니다.
4. 검색 결과가 화면에 표시됩니다.
5. 검색 결과를 단일 클릭하면 `/api/queue/add`로 앱 내부 대기열에 추가합니다.
6. 검색 결과를 더블 클릭하면 `/api/play`로 Spotify 재생을 시작합니다.
7. 브라우저는 `EventSource("/api/player")`로 서버와 연결되어 플레이어 상태와 대기열 변경을 실시간으로 받습니다.
8. 하단 플레이어 바의 버튼과 슬라이더는 `/api/toggle`, `/api/play/next`, `/api/seek`, `/api/volume` 같은 API를 호출합니다.

## 핵심 알고리즘

### 1. 토큰 갱신

`api/spotify.ts`는 `spotify.json`에 저장된 토큰의 `expiresAt`을 확인합니다. 만료까지 60초 미만이면 Spotify token endpoint에 refresh token을 보내 새 access token을 발급받고, 다시 `spotify.json`에 저장합니다.

이 덕분에 API 호출 코드는 매번 직접 토큰 만료를 처리하지 않고 `spotifyRequest`만 사용하면 됩니다.

### 2. 플레이어 상태 스냅샷

`api/server.ts`는 Spotify의 `/me/player` 응답을 `PlayerSnapshot`으로 변환합니다.

스냅샷에는 다음 값이 포함됩니다.

- 현재 재생 여부
- 볼륨
- 현재 재생 위치
- 전체 길이 대비 진행률
- 마지막 갱신 시각
- 현재 트랙 정보

프론트엔드는 이 스냅샷을 기준으로 UI를 그립니다.

### 3. SSE 실시간 동기화

`GET /api/player` 요청이 `Accept: text/event-stream`을 포함하면 서버는 연결을 닫지 않고 유지합니다. 서버는 1.5초마다 Spotify 재생 상태를 다시 조회하고, 변경된 플레이어 상태와 대기열을 이벤트로 전송합니다.

전송되는 이벤트는 두 종류입니다.

- `player`: 현재 재생 상태
- `queue`: 앱 내부 대기열 상태

 - `SearchPage.tsx`
   - `EventSource`

### 4. 부드러운 진행률 보정

서버는 주기적으로 실제 Spotify 상태를 보내지만, 1.5초 단위로만 갱신하면 진행 바가 끊겨 보일 수 있습니다.

그래서 프론트엔드는 `updatedAt`과 현재 시간을 비교해 재생 중인 곡의 진행 시간을 로컬에서 추정합니다. 서버에서 새 스냅샷이 와도 같은 곡의 같은 초 단위 진행이라면 기존 로컬 진행률을 유지해 UI 튐을 줄입니다.

 - `SearchPage.tsx`
   - `estimateProgressMs`
   - `samePlaybackSecond`
   - `reconcilePlayer`

### 5. 자체 대기열 처리

Spotify 계정의 실제 queue를 직접 조작하지 않고, 서버 메모리의 `queueItems` 배열로 앱 자체 대기열을 관리합니다.

- `/api/queue/add`: 트랙을 대기열 끝에 추가
- `/api/queue/play`: 선택한 대기열 항목을 재생하고 목록에서 제거
- `/api/queue/remove`: 선택한 대기열 항목 제거

재생 중인 곡이 끝난 것으로 판단되면 서버는 대기열의 첫 번째 곡을 자동으로 재생합니다. 곡 종료 여부는 남은 시간이 1.5초 이하이거나 진행률이 99% 이상인지로 판단합니다.

### 6. 다음 곡 처리

`/api/play/next`는 먼저 Spotify의 next API를 호출합니다. 이후 실제 재생 곡이 바뀌지 않았거나 재생 대상이 없는 경우, 앱 자체 대기열의 첫 번째 곡을 대신 재생합니다.

이 방식은 Spotify 플레이어의 기본 다음 곡 동작과 앱 내부 대기열을 함께 사용하기 위한 보정 로직입니다.

## API

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/api/player` | 현재 플레이어 상태 조회 또는 SSE 연결 |
| `GET` | `/api/search` | Spotify 트랙 검색 |
| `GET` | `/api/queue` | 앱 내부 대기열 조회 |
| `POST` | `/api/queue/add` | 대기열에 트랙 추가 |
| `POST` | `/api/queue/play` | 대기열 항목 재생 |
| `POST` | `/api/queue/remove` | 대기열 항목 제거 |
| `POST` | `/api/play` | 특정 트랙 재생 |
| `POST` | `/api/play/previous` | 이전 곡 |
| `POST` | `/api/play/next` | 다음 곡 또는 대기열 다음 곡 |
| `POST` | `/api/toggle` | 재생/일시정지 전환 |
| `POST` | `/api/volume` | 볼륨 변경 |
| `POST` | `/api/seek` | 재생 위치 이동 |

---
> [!TIP]
>
> - Spotify가 활성 재생 기기를 찾지 못하면 재생 제어 API가 실패할 수 있습니다.
>   - 먼저 Spotify 앱에서 한 번 재생을 시작해 활성 기기를 만들어 주세요.
> - 대기열은 서버 메모리에만 저장됩니다. API 서버를 재시작하면 대기열은 초기화됩니다.
> - `spotify.config.json`과 `spotify.json`에는 민감한 인증 정보가 들어가므로 외부에 공유하지 않아야 합니다.