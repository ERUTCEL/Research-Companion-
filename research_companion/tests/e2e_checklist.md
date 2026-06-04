# CLIO — End-to-End Verification Checklist

릴리즈 전 수동 QA 체크리스트. 자동 테스트 먼저 실행:
```
./run.sh --test      # Mac/Linux
.\run.ps1 --test     # Windows
```

---

## 0. LLM 설정 (최우선)

- [ ] 앱 실행 → 우측 상단 설정 버튼(⚙) 클릭
- [ ] Ollama 선택 → `ollama serve` 실행 중인지 확인
- [ ] 또는 Anthropic/OpenAI/Gemini/Groq 선택 → API 키 입력 → 저장
- [ ] 저장 후 상태 표시줄에 활성 프로바이더 표시 확인
- [ ] Ollama 사용 시: Local AI 패널에서 모델 설치 (qwen3:8b 권장)

## 1. 백엔드 연결

- [ ] 앱 실행 시 로딩 스피너 표시 ("백엔드 시작 중...")
- [ ] `/health` → `{ status: "ok", ready: true }` 반환
- [ ] BGE-M3 warmup 완료 후 로딩 화면 사라짐 (최초 1~2분 소요)
- [ ] 백엔드 실패 시 "백엔드 연결 대기 중..." 표시

## 2. PDF 문서 수집

- [ ] 폴더 선택 버튼 → OS 파일 다이얼로그 열림
- [ ] PDF 드래그 앤 드롭 → 인제스트 시작
- [ ] 진행률 바 실시간 업데이트
- [ ] 완료 후 Library 탭에 문서 등록
- [ ] 동일 PDF 재수집 → skip (중복 없음)
- [ ] `parse_quality` 필드 포함 확인

## 3. Notion 수집

- [ ] 설정 화면에서 Notion 토큰 입력
- [ ] DB 목록 불러오기
- [ ] `is_user_memo` 컬럼 구분 (요약 vs 내 생각)
- [ ] 중요도 가중치 반영

## 4. RAG 전체 루프

- [ ] 영어 질문 → 영어 논문 검색 및 답변
- [ ] 한국어 질문 → 한국어 답변 (BGE-M3 사용 시 크로스랭귀얼 가능)
- [ ] 첫 토큰 10초 이내 (Ollama 기준)
- [ ] 스트리밍 토큰 단위 전달
- [ ] citations에 index/page/is_user_memo 포함
- [ ] 내 메모 인용 시 "[내 메모]" 구분 표시
- [ ] 소스 없을 때 LLM 미호출, 고정 메시지 반환
- [ ] 자연어 필터 ("2023년 이후", "중요도 높은") 동작

## 5. 폴백 동작

- [ ] Ollama 없음 → 설정 프로바이더로 자동 전환
- [ ] 설정된 LLM 없음 → "설정 화면에서 LLM을 설정하세요" 안내
- [ ] API 키 오류 → 명확한 에러 메시지

## 6. Mac 전용 기능

- [ ] `titleBarStyle: 'hiddenInset'` → 타이틀바 숨김, 트래픽 라이트 노출
- [ ] Dock 아이콘 표시
- [ ] `npm run build:mac` → `.dmg` 생성
- [ ] 배포 .dmg에서 앱 정상 실행

## 7. Windows 전용 기능

- [ ] `frame: true` → 네이티브 타이틀바 표시
- [ ] 작업 표시줄 아이콘 표시 (`icon.ico`)
- [ ] `npm run build:win` (Windows) → NSIS `.exe` 생성
- [ ] WSL 빌드 → `win-unpacked/CLIO.exe` 실행 가능
- [ ] `run.ps1` → Python 체크 → venv → npm → 앱 실행
- [ ] `run.ps1 --test` → 통합 테스트 PASS/FAIL 출력

---

## 릴리즈 게이트

- [ ] `./run.sh --test` 0 failed
- [ ] 섹션 0~5 수동 체크 완료
- [ ] Mac 섹션 6 완료 (Mac 코드 변경 시)
- [ ] Windows 섹션 7 완료 (Windows 빌드 제공 시)
