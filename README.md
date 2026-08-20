# Lowpoly Modeler CLI

이미지와 자연어 요청을 재현 가능한 JSON recipe로 바꾸고, 정적 저폴리 게임 에셋을 GLB로 생성·수정·검증하는 Node.js CLI입니다.

```text
참고 이미지 + 자연어 요청
→ Codex lowpoly-modeler 스킬
→ recipe.json
→ Lowpoly Modeler CLI
→ 검증된 GLB
```

Blender, 브라우저 UI, React에 의존하지 않습니다. CLI 내부의 메시 연산과 Three.js GLB 입출력만 사용합니다.

## 주요 기능

- Cube, Plane, Cylinder, Cone, Sphere, Faceted Icosphere 생성
- 경로 기반 Tube 생성
- Join, Weld, Boolean Difference/Union/Intersection
- Mirror, Bend, 1-segment Bevel
- Face Extrude/Inset/Delete, Edge Subdivide, Vertex Transform/Merge
- 기존 GLB의 이름·재질·계층·메시 편집
- `shade_pivot`, Ground, `+Y Up`, `+Z Forward` 게임 구조
- 모든 출력 노드의 scale을 `1, 1, 1`로 bake
- GLB export 후 재오픈 검증
- texture/image payload가 없는 GLB 보장
- Codex 프로젝트 로컬 스킬 포함

## 요구 사항

- Node.js 24 이상
- npm

## 빠른 시작

```powershell
npm install
npm run build

# 예제 벽 생성
node dist/cli.js build examples/wall.recipe.json --out output/wall.glb

# 결과 검증
node dist/cli.js validate output/wall.glb

# 계층, 크기, 오브젝트 및 요소 ID 확인
node dist/cli.js inspect output/wall.glb --json
```

전역 `lowpoly` 명령을 사용하고 싶다면 빌드 후 `npm link`를 한 번 실행합니다.

```powershell
npm link
lowpoly build examples/wall.recipe.json --out output/wall.glb
```

## Codex에서 이미지로 만들기

이 프로젝트를 Codex 작업 폴더로 연 뒤 이미지를 첨부하고 다음과 같이 요청합니다.

```text
$lowpoly-modeler 이 이미지를 단색 저폴리 게임 에셋으로 만들어줘.
높이는 2m 정도로 보고, 바닥은 Y=0에 맞추고, 정면은 +Z로 해줘.
GLB와 수정 가능한 recipe를 같이 남겨줘.
```

프로젝트 로컬 스킬은 [.agents/skills/lowpoly-modeler/SKILL.md](.agents/skills/lowpoly-modeler/SKILL.md)에 있습니다. 스킬은 이미지를 형태별 부품으로 분해하고, recipe 작성 → build/edit → validate → inspect 순서로 결과를 확인합니다.

한 장의 이미지에서 보이지 않는 뒷면, 깊이, 실제 크기는 추정이 필요합니다. 중요한 치수나 회전축이 있다면 요청에 함께 적는 것이 좋습니다.

## 명령

| 명령 | 용도 |
| --- | --- |
| `lowpoly build <recipe> --out <glb>` | 새 GLB 생성 |
| `lowpoly edit <source.glb> <recipe> --out <glb>` | 기존 GLB 수정 |
| `lowpoly validate <glb>` | 게임 에셋 및 GLB payload 검증 |
| `lowpoly validate <glb> --strict` | warning도 실패 exit code로 처리 |
| `lowpoly inspect <glb> --json` | 계층, bounds, 재질, Vertex/Face/Edge ID 확인 |
| `lowpoly schema [--out <json>]` | 현재 CLI의 recipe JSON Schema 출력 |

`npm link`를 사용하지 않았다면 `lowpoly` 대신 `node dist/cli.js`를 사용합니다.

## 최소 Recipe

```json
{
  "version": 1,
  "name": "faceted-orb",
  "metadata": {
    "forward": "+Z",
    "groundY": 0,
    "groundTolerance": 0.001
  },
  "steps": [
    { "op": "group", "name": "shade_pivot" },
    {
      "op": "primitive",
      "kind": "icosphere",
      "name": "orb",
      "parent": "shade_pivot",
      "radius": 0.8,
      "subdivisions": 2,
      "position": [0, 0.8, 0],
      "color": "#d9765e",
      "shading": "flat"
    }
  ]
}
```

좌표계는 `+Y Up`, `+Z Forward`이며 모든 회전값과 Bend 각도는 **degree**입니다. 크기와 scale은 geometry에 bake되어 최종 GLB의 노드 scale은 `1, 1, 1`입니다.

Recipe는 strict schema로 검사합니다. 오타나 지원하지 않는 필드는 조용히 무시하지 않고 오류로 처리합니다. 스키마 원본은 [schemas/recipe.schema.json](schemas/recipe.schema.json)입니다.

## 예제

- [2칸 벽](examples/wall.recipe.json)
- [각진 Icosphere](examples/faceted-orb.recipe.json)
- [사탕 지팡이 Tube](examples/candy-cane.recipe.json)
- [분수](examples/fountain.recipe.json)
- [Boolean Difference](examples/boolean-cut.recipe.json)
- [기존 벽 수정](examples/edit-wall.recipe.json)

## 검증 범위

`build`와 `edit`는 출력 전에 문서를 검사하고, GLB를 만든 뒤 다시 열어 한 번 더 검사합니다.

- geometry 및 material 참조
- 유한한 transform과 unit scale
- hierarchy 무결성
- Ground와 방향 메타데이터
- export 전후 visible mesh 수
- texture/image payload 부재
- flat-shading hard normal과 편집 가능한 저폴리 topology

## 문서

자세한 설치, 이미지 요청법, 모든 recipe 연산, 기존 GLB 수정, 오류 해결 방법은 [USER_GUIDE.md](USER_GUIDE.md)를 참고하세요.

## 범위 밖

이 도구는 **정적·단색·저폴리 게임 소품** 제작용입니다. 다음 기능은 제공하지 않습니다.

- 텍스처가 포함된 GLB 편집
- UV 베이킹과 텍스처 페인팅
- 리깅과 애니메이션
- 스컬프팅과 리토폴로지
- 포토리얼 모델링과 복잡한 유기체 제작

## 개발 및 검증

```powershell
npm run check
```

Strict TypeScript 검사, CLI 빌드, 단위 테스트 및 GLB round-trip 통합 테스트를 실행합니다.
