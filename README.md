# CLIO

로컬 우선 AI 논문 관리 앱. PDF를 로컬에서 인덱싱하고 자연어로 질문합니다.

- **완전 오프라인 동작** — Ollama 설치 시 API 키 없이 사용 가능
- **PDF 파싱/OCR** — PyMuPDF, EasyOCR (한글 지원)
- **하이브리드 RAG** — BGE-M3 임베딩 + ms-marco 리랭커, ChromaDB 저장
- **인용 추적** — 답변마다 출처 논문과 페이지 표시
- **선택적 클라우드 AI** — Anthropic Claude, OpenAI, Google Gemini, Groq 지원

## 다운로드

| 플랫폼 | 링크 |
|--------|------|
| macOS Apple Silicon | [CLIO-0.1.0-arm64.dmg](https://github.com/ERUTCEL/Research-Companion-/releases/tag/v0.1.1) |

### macOS 보안 경고 우회

Apple 공증이 없어 처음 실행 시 경고가 뜰 수 있습니다.

**방법 1 — 터미널 (권장)**
```bash
xattr -dr com.apple.quarantine /Applications/CLIO.app
```

**방법 2 — Finder**
1. DMG 열고 CLIO.app을 응용 프로그램 폴더로 드래그
2. Finder에서 CLIO.app **우클릭 → 열기**
3. 경고창에서 **열기** 클릭

## 사용법

1. [Ollama](https://ollama.com) 설치 후 실행
2. CLIO 앱 실행
3. PDF 드래그&드롭 또는 "문서 선택" → 인덱싱 (첫 실행 시 BGE-M3 로딩 1-2분)
4. 채팅창에서 논문 내용 질문

API 키가 있다면 좌측 하단 ⚙️ 설정에서 Claude / Gemini 등으로 전환 가능합니다.

## 요구사항

- macOS Apple Silicon (arm64)
- RAM 16GB 이상 권장
- [Ollama](https://ollama.com) (qwen3:8b 이상) — 없으면 API 키 필요

## 개발자용 실행

```bash
# 백엔드
cd research_companion
uv venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn api.main:app --host 127.0.0.1 --port 8001

# 프론트엔드 (별도 터미널)
cd app
npm install
npm run dev
```

## 배포 빌드

```bash
bash build.sh   # macOS
.\build.ps1     # Windows
```
