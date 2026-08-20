# Lowpoly CLI — 인수인계 및 개발계획

## 1. 목표

Codex가 자연어 요청을 구조화된 recipe JSON으로 작성하면, Node.js 기반 CLI가 실제 저폴리 메시를 생성·수정·검증하여 GLB로 저장한다.

```text
Codex 요청
  → recipe.json 생성
  → lowpoly build / edit
  → 검증된 GLB
```

웹 UI, 브라우저 자동화, Blender 실행에 의존하지 않는다. 단, 저폴리 게임 에셋 제작에 필요한 모델링 기능은 CLI 내부에서 직접 제공한다.

## 2. 왜 별도 CLI인가

기존 웹 에디터를 마우스·입력칸으로 조작하는 방식은 Codex 자동화에 비효율적이다. 오브젝트 하나마다 UI 이벤트, 렌더링, 선택 상태가 필요해 느리고 취약하다.

CLI는 UI를 거치지 않고 메시 코어를 직접 호출한다.

```text
비효율적: Codex → 브라우저 UI → 버튼/입력 → React 상태 → 메시
목표 방식: Codex → recipe → 메시 연산 → GLB
```

Blender는 런타임 의존성이 아니다. 이 도구는 단순 게임용 저폴리 에셋 제작·수정 범위에서 Blender CLI를 대체한다. 복잡한 UV, 베이킹, 리토폴로지, 리깅 등은 범위 밖이다.

## 3. 기술 선택

- Runtime: Node.js 24
- Language: TypeScript strict
- 3D: Three.js
- Input: JSON recipe
- Output: GLB
- Command parsing: Node 기본 `parseArgs` 우선
- Browser, React, Vite, Playwright, Blender: 런타임 미사용

기존 `lowpoly-modeler`에서 재사용할 코드:

- `src/editor/core/types.ts`: `SceneDocument`, `MeshData`, `MaterialData`, `Transform`
- `src/editor/core/document.ts`: Primitive, transform, hierarchy, resize, apply scale
- `src/editor/geometry/mesh-data.ts`: Primitive 생성
- `src/editor/geometry/mesh-operations.ts`: extrude, inset, bevel, subdivide, bend, mirror, merge
- `src/editor/geometry/boolean-spike.ts`: Boolean
- `src/editor/geometry/world-bounds.ts`: bounds 및 ground 처리
- `src/editor/geometry/three-bridge.ts`: `MeshData` → Three.js geometry
- `src/editor/io/gltf.ts`: GLB export/import 구조 참고
- `src/editor/validation/document-validation.ts`: game asset validation

브라우저 다운로드 함수는 재사용하지 않는다. Node 파일 시스템으로 GLB `ArrayBuffer`를 직접 쓴다.

## 4. AI 메시 생성의 의미

CLI 내부에 별도 생성형 AI 모델을 넣지 않는다.

Codex가 reference image와 요청을 해석해 recipe를 만들고, CLI가 그 recipe를 결정론적으로 메시로 컴파일한다. Primitive 조립, 병합, Boolean, 곡선 연산이 모두 AI 메시 생성 결과의 일부다.

## 5. 명령 구조

```powershell
# 새 모델 생성
lowpoly build wall.recipe.json --out wall.glb

# 기존 GLB 수정
lowpoly edit source.glb wall-edits.recipe.json --out wall-fixed.glb

# GLB 검증
lowpoly validate wall.glb
```

## 6. 필수 기능

### 6.1 새 모델 생성

- [ ] Cube, Cylinder, Cone, Icosphere
- [ ] 이름, 크기, 위치, 회전, 단색 material
- [ ] low-poly segment 수 지정
- [ ] GLB 저장
- [ ] Object scale을 geometry에 bake해 최종 scale을 `1, 1, 1`로 유지

### 6.2 면이 많은 각진 구

완전히 매끈한 Sphere가 아니라, 삼각형 면이 보이는 **Faceted Icosphere**를 표준 구 Primitive로 둔다.

- [ ] `subdivisions` 0~3 지원
- [ ] 기본값 `subdivisions: 2`
- [ ] 기본값 `flatShading: true`
- [ ] GLB export/reopen 뒤에도 hard normal과 각진 면 표현 유지
- [ ] Smooth shading은 명시적으로 요청할 때만 적용

```json
{
  "op": "primitive",
  "kind": "icosphere",
  "name": "faceted-orb",
  "radius": 0.8,
  "subdivisions": 2,
  "shading": "flat",
  "color": "#d9765e"
}
```

### 6.3 조립과 병합

- [ ] 여러 Primitive 조립
- [ ] `join`: 여러 object를 하나의 mesh로 결합
- [ ] `weld`: 가까운 vertex 병합
- [ ] Boolean Difference / Union / Intersection
- [ ] 이름으로 target object를 지정

### 6.4 곡선과 부드러운 형태

`Smooth Shading`은 빛 표현만 부드럽게 할 뿐 실루엣을 곡선으로 만들지 않는다. 실제 곡선에는 geometry 연산이 필요하다.

- [ ] Bevel: 모서리를 둥글게
- [ ] Bend: 메시를 일정한 호로 굽힘
- [ ] Tube/Path: 점들을 따라 저폴리 관 생성
- [ ] Face Extrude + Rotate: 끝면을 밀고 꺾어 갈고리·캔디 케인·줄기 생성
- [ ] Flat / Smooth shading

### 6.5 GLB 수정과 게임 구조

- [ ] GLB import
- [ ] hierarchy와 material 유지
- [ ] Object 삭제·이름 변경·transform
- [ ] Vertex / Edge / Face 선택 및 편집
- [ ] Extrude, Inset, Bevel, Subdivide, Merge
- [ ] Group / hierarchy
- [ ] `shade_pivot` 생성·배치·parenting
- [ ] Ground 정렬, `+Y Up`, `+Z Forward` 확인
- [ ] geometry, scale, material, texture 참조 검증
- [ ] 수정 뒤 GLB export

## 7. Recipe 예시

```json
{
  "name": "fixed-wall-2-bay",
  "steps": [
    {
      "op": "primitive",
      "kind": "cube",
      "name": "base",
      "size": [7.2, 0.5, 1.1],
      "position": [0, 0.25, 0],
      "color": "#eadfc9"
    },
    {
      "op": "primitive",
      "kind": "cube",
      "name": "center-column",
      "size": [0.42, 2.05, 0.34],
      "position": [0, 1.7, 0.43],
      "color": "#eadfc9"
    },
    {
      "op": "bevel",
      "target": "base",
      "width": 0.08,
      "segments": 1
    }
  ]
}
```

## 8. 구현 순서

### Phase 1 — 생성 기반

- [ ] CLI 프로젝트 초기화
- [ ] recipe parser와 schema validation
- [ ] Primitive, transform, 색상, baked size
- [ ] GLB export와 Node 파일 저장
- [ ] Cube/Cylinder/Cone/Faceted Icosphere
- [ ] texture/image 없는 GLB 검사
- [ ] 2칸 벽 recipe와 자동 테스트

### Phase 2 — 형태 만들기

- [ ] join / weld
- [ ] Boolean
- [ ] Mirror
- [ ] Bevel
- [ ] Bend
- [ ] Tube/Path
- [ ] Flat/Smooth shading

### Phase 3 — 수정과 게임 구조

- [ ] GLB import
- [ ] Object / Vertex / Edge / Face 편집
- [ ] Face Extrude + Rotate
- [ ] hierarchy / `shade_pivot`
- [ ] validation / export round-trip test

## 9. 완료 기준

- [ ] Codex가 recipe만으로 벽·분수·사탕 지팡이·각진 장식 구체를 생성한다.
- [ ] 기존 GLB를 읽어 불필요한 부분 삭제·병합·변형하고 다시 GLB로 저장한다.
- [ ] 곡선은 실제 geometry로 생성되고, 단순 shading 효과에 의존하지 않는다.
- [ ] GLB에는 texture/image payload가 없으며, game engine에서 정상 로드된다.
- [ ] 모든 export mesh의 scale은 `1, 1, 1`이다.
- [ ] 브라우저나 Blender를 실행하지 않는다.
