# Lowpoly Modeler CLI 사용 설명서

이 문서는 Lowpoly Modeler CLI를 직접 사용하거나, Codex에 이미지를 입력해 저폴리 GLB를 만드는 방법을 설명합니다.

## 1. 작동 방식

이 프로젝트는 생성형 AI를 CLI 안에 포함하지 않습니다.

1. 사용자가 Codex에 이미지와 자연어 요청을 전달합니다.
2. Codex의 `lowpoly-modeler` 스킬이 이미지를 분석합니다.
3. 분석 결과를 strict JSON recipe로 작성합니다.
4. CLI가 recipe를 결정론적으로 메시로 변환합니다.
5. 생성된 GLB를 다시 열어 geometry, scale, hierarchy, payload를 검증합니다.
6. GLB와 수정 가능한 recipe를 함께 보존합니다.

같은 recipe와 같은 CLI 버전을 사용하면 같은 구조의 모델을 다시 만들 수 있습니다.

## 2. 지원 범위

적합한 대상:

- 벽, 기둥, 울타리, 문, 상자 같은 각진 구조물
- 분수, 화분, 받침대 같은 회전형 소품
- 사탕 지팡이, 줄기, 손잡이, 파이프 같은 경로형 소품
- 각진 장식 구체와 단순한 저폴리 조형물
- 단색 재질을 사용하는 정적 게임 에셋

지원하지 않는 대상:

- 텍스처와 이미지가 포함된 모델
- 캐릭터 리깅과 애니메이션
- UV 베이킹, 텍스처 페인팅, 리토폴로지
- 스컬프팅이나 복잡한 유기체
- 사진과 동일한 포토리얼 결과

## 3. 설치

### 3.1 요구 사항

- Node.js 24 이상
- npm

버전을 확인합니다.

```powershell
node --version
npm --version
```

프로젝트 폴더에서 의존성을 설치하고 빌드합니다.

```powershell
cd C:\Users\Eurya\Desktop\lowpoly-modeler-cli
npm install
npm run build
```

빌드 결과는 `dist/`에 생성됩니다.

### 3.2 실행 방식

프로젝트 내부에서 직접 실행:

```powershell
node dist/cli.js help
```

선택적으로 전역 명령 연결:

```powershell
npm link
lowpoly help
```

이 문서의 `lowpoly` 명령은 모두 `node dist/cli.js`로 바꿔서 실행할 수 있습니다.

## 4. Codex에서 이미지로 생성하기

프로젝트를 Codex 작업 폴더로 연 상태에서 이미지를 첨부합니다. 명시적으로 스킬을 호출하려면 요청 첫 부분에 `$lowpoly-modeler`를 적습니다.

```text
$lowpoly-modeler 이 이미지를 저폴리 게임 에셋으로 만들어줘.
전체 높이는 약 1.8m, 바닥은 Y=0, 정면은 +Z로 맞춰줘.
각진 면을 유지하고 단색 재질을 사용해줘.
GLB와 recipe를 output 폴더에 같이 저장해줘.
```

좋은 요청에 포함하면 유용한 정보:

- 용도: 장식물, 충돌체 기준 소품, 회전 가능한 오브젝트 등
- 기준 크기: 높이, 폭, 깊이 중 하나 이상
- 정면: 이미지의 어느 방향을 `+Z`로 볼지
- 바닥 접점: 받침대 바닥, 발끝, 중심 등
- 대칭 여부와 생략하면 안 되는 부품
- 원하는 면 수나 각진 정도
- 원하는 색상 또는 대략적인 팔레트

이미지 한 장에서 보이지 않는 부분은 Codex가 보수적으로 추정합니다. 뒷면 구조나 실제 깊이가 결과의 기능을 바꾼다면 요청에 명시하세요.

Codex 작업의 정상적인 결과물은 다음 두 파일입니다.

```text
output/asset.recipe.json
output/asset.glb
```

수정할 때는 GLB뿐 아니라 recipe도 함께 유지하는 것이 좋습니다.

## 5. CLI 명령

### 5.1 새 모델 생성: `build`

```powershell
lowpoly build <recipe.json> --out <output.glb>
```

예:

```powershell
lowpoly build examples/wall.recipe.json --out output/wall.glb
```

출력 폴더가 없으면 자동으로 만듭니다. Recipe 오류나 geometry validation 오류가 있으면 GLB를 쓰지 않고 non-zero exit code로 종료합니다.

### 5.2 기존 모델 수정: `edit`

```powershell
lowpoly edit <source.glb> <edit.recipe.json> --out <output.glb>
```

예:

```powershell
lowpoly edit output/wall.glb examples/edit-wall.recipe.json --out output/wall-edited.glb
```

원본을 보존하기 위해 입력 파일과 다른 출력 경로를 권장합니다. Texture/image payload가 포함된 GLB는 편집하지 않으며 명확한 오류를 반환합니다.

### 5.3 검증: `validate`

```powershell
lowpoly validate output/wall.glb
```

JSON 결과:

```powershell
lowpoly validate output/wall.glb --json
```

Warning도 실패 exit code로 처리:

```powershell
lowpoly validate output/wall.glb --strict
```

일반 `validate`에서는 error만 실패입니다. `--strict`에서는 warning도 실패이며 info는 실패로 처리하지 않습니다.

### 5.4 구조 확인: `inspect`

```powershell
lowpoly inspect output/wall.glb
lowpoly inspect output/wall.glb --json
```

`--json` 결과에는 다음 정보가 포함됩니다.

- Asset 이름과 GLB byte 크기
- Mesh, Material, Texture, Image 수
- 전체 bounds
- Object 이름, ID, parent ID
- Position, rotation degree, scale
- Vertex 및 Face 수
- Material 이름
- Vertex, Face, Edge ID
- Validation 결과

기존 GLB에서 특정 Vertex/Face/Edge를 편집할 때 이 ID를 recipe에 사용합니다.

### 5.5 Recipe Schema 출력: `schema`

표준 출력으로 확인:

```powershell
lowpoly schema
```

파일로 저장:

```powershell
lowpoly schema --out schemas/recipe.schema.json
```

Schema가 recipe 필드의 최종 기준입니다. 알 수 없는 필드는 허용하지 않습니다.

## 6. 좌표와 단위

- 좌표계: 오른손 좌표계
- 위쪽: `+Y`
- 정면: `+Z`
- 위치와 크기: 프로젝트가 선택한 월드 단위
- 회전과 Bend 각도: degree
- 색상: `#RRGGBB`
- 최종 노드 scale: `1, 1, 1`

예를 들어 높이 2m를 2월드 단위로 정했다면 `[폭, 2, 깊이]`를 사용합니다. 여러 에셋을 같은 게임에 사용할 경우 단위 기준을 통일하세요.

## 7. Recipe 기본 구조

```json
{
  "version": 1,
  "name": "asset-name",
  "metadata": {
    "forward": "+Z",
    "groundY": 0,
    "groundTolerance": 0.001
  },
  "steps": []
}
```

### 최상위 필드

| 필드 | 필수 | 의미 |
| --- | --- | --- |
| `version` | 아니요 | 현재 recipe 버전. 지정할 경우 `1` |
| `name` | 예 | Asset 이름 |
| `metadata` | 아니요 | 방향과 Ground 검증 설정 |
| `steps` | 예 | 순서대로 실행할 모델링 연산 |

### Metadata

| 필드 | 의미 |
| --- | --- |
| `forward` | 현재 지원값은 `+Z`. 설정하면 방향 확인 완료로 기록 |
| `groundY` | 목표 바닥 Y. 기본값 `0` |
| `groundTolerance` | Ground 오차 허용값. 기본값 `0.001` |

Step은 위에서 아래로 순서대로 실행됩니다. 뒤쪽 Step은 앞에서 만든 오브젝트를 이름 또는 ID로 지정할 수 있습니다.

## 8. 생성 연산

### 8.1 `primitive`

지원 종류:

| `kind` | 기본 형태 | 주요 필드 |
| --- | --- | --- |
| `cube` | 1×1×1 상자 | `size` |
| `plane` | XZ 평면 | `size` |
| `cylinder` | Y축 원기둥 | `radius`, `height`, `segments` |
| `cone` | Y축 원뿔 | `radius`, `height`, `segments` |
| `sphere` | UV Sphere | `radius`, `segments`, `latitudeSegments` |
| `icosphere` | 삼각면 장식 구체 | `radius`, `subdivisions` 0~3 |

공통 필드:

- `name`: 고유 오브젝트 이름
- `parent`: 부모 이름 또는 ID
- `position`: `[x, y, z]`
- `rotation`: `[x, y, z]` degree
- `color`: `#RRGGBB`
- `roughness`, `metalness`, `opacity`: 0~1
- `shading`: `flat` 또는 `smooth`

예:

```json
{
  "op": "primitive",
  "kind": "cylinder",
  "name": "column",
  "parent": "shade_pivot",
  "radius": 0.25,
  "height": 1.8,
  "segments": 8,
  "position": [0, 0.9, 0],
  "color": "#c9beb1",
  "shading": "flat"
}
```

Icosphere는 `subdivisions: 2`, `shading: "flat"`이 표준 장식 구체 설정입니다.

### 8.2 `tube`

점들을 따라 저폴리 관을 만듭니다.

```json
{
  "op": "tube",
  "name": "handle",
  "parent": "shade_pivot",
  "path": [[0, 0, 0], [0, 1, 0], [0.4, 1.4, 0], [0.8, 1.2, 0]],
  "radius": 0.12,
  "segments": 8,
  "capped": true,
  "color": "#c83245",
  "shading": "flat"
}
```

- `path`: 최소 2개의 `[x, y, z]` 점
- `radius`: 관 반지름
- `segments`: 단면 분할 수, 3~64
- `capped`: 양 끝을 막을지 여부

갈고리, 손잡이, 줄기, 파이프는 Bend보다 Tube가 간단한 경우가 많습니다.

### 8.3 `group`

계층과 Pivot을 만듭니다.

```json
{ "op": "group", "name": "shade_pivot", "position": [0, 0, 0] }
```

회전 가능한 게임 에셋은 `shade_pivot` 아래에 모든 시각 부품을 parent하는 방식을 권장합니다.

## 9. Object 및 Material 연산

### `transform`

```json
{
  "op": "transform",
  "target": "column",
  "translate": [0.2, 0, 0],
  "rotate": [0, 15, 0],
  "scale": [1, 1.2, 1]
}
```

- `position`, `rotation`: 현재 값을 교체
- `translate`, `rotate`: 현재 값에 더함
- `scale`: geometry에 반영. Mesh 출력 scale은 다시 unit scale
- `size`: Mesh의 최종 local bounds 크기로 조정

Scale 요소는 0일 수 없습니다.

### `material`

```json
{
  "op": "material",
  "target": "column",
  "color": "#d4b483",
  "roughness": 0.8,
  "metalness": 0,
  "opacity": 1,
  "shading": "flat"
}
```

### 이름·삭제·계층·Ground

```jsonl
{ "op": "rename", "target": "old-name", "name": "new-name" }
{ "op": "delete", "target": "unused-part" }
{ "op": "parent", "target": "column", "parent": "shade_pivot" }
{ "op": "ground", "target": "shade_pivot", "y": 0 }
```

`ground`에서 `target`을 생략하면 Asset root의 자식들을 함께 이동합니다.

## 10. 조립 연산

### 10.1 `join`

여러 Mesh를 월드 위치 그대로 하나의 Mesh로 결합합니다.

```json
{
  "op": "join",
  "targets": ["left-part", "right-part"],
  "name": "body",
  "weldTolerance": 0.0001
}
```

원본 오브젝트는 제거되고 결합 결과가 Asset root 아래에 만들어집니다. 재질은 유지됩니다.

### 10.2 `weld`

가까운 Vertex를 병합합니다.

```json
{ "op": "weld", "target": "body", "distance": 0.0001 }
```

### 10.3 `boolean`

```json
{
  "op": "boolean",
  "operation": "difference",
  "target": "block",
  "cutter": "hole-cutter",
  "name": "cut-block",
  "keepCutter": false
}
```

`operation`은 `difference`, `union`, `intersection`입니다. 기본적으로 Cutter는 결과 생성 후 삭제됩니다. `keepCutter: true`이면 유지합니다.

Boolean 입력은 닫힌 메시여야 합니다. 열린 면, 퇴화 면, 자기 교차 메시에서는 실패할 수 있습니다.

## 11. 형태 연산

### `mirror`

```json
{ "op": "mirror", "target": "half-body", "axis": "x", "weldTolerance": 0.0001 }
```

선택 축의 0 평면을 기준으로 메시를 복제합니다. 전체 모델이 아니라 seam이 축 위에 놓인 절반 모델에 사용하는 것이 좋습니다.

### `bend`

```json
{ "op": "bend", "target": "stem", "axis": "y", "angle": 90, "origin": [0, 0, 0] }
```

`angle`은 degree입니다. 실루엣이 명확한 경로형 물체는 Tube가 더 예측 가능한 경우가 많습니다.

### `bevel`

```json
{ "op": "bevel", "target": "base", "width": 0.08, "segments": 1 }
```

현재는 저폴리 스타일의 1-segment Bevel만 지원합니다. 닫힌 각진 메시에서 가장 안정적입니다.

## 12. Face, Edge, Vertex 편집

방향 기반 Face 선택:

```text
top, bottom, front, back, left, right, all
```

명시적인 ID 배열도 사용할 수 있습니다. ID는 `inspect --json`으로 확인합니다.

### Face Extrude

```json
{
  "op": "extrude",
  "target": "body",
  "faces": "top",
  "distance": 0.4,
  "rotate": [0, 0, 10]
}
```

연결된 선택 Face는 하나의 영역으로 Extrude됩니다.

### Face Inset 및 삭제

```jsonl
{ "op": "inset", "target": "body", "faces": "front", "factor": 0.2 }
{ "op": "delete_faces", "target": "body", "faces": ["mesh-1_f4"] }
```

Inset `factor`는 0보다 크고 1보다 작아야 합니다.

### Edge Subdivide

```json
{ "op": "subdivide", "target": "body", "edges": ["mesh-1_v1:mesh-1_v2"] }
```

선택 Edge의 중간에 Vertex를 추가합니다. `edges`를 생략하거나 `all`로 지정하면 모든 Edge를 선택합니다.

### Vertex Transform 및 Merge

```json
{
  "op": "transform_vertices",
  "target": "body",
  "vertices": ["mesh-1_v1", "mesh-1_v2"],
  "translate": [0, 0.2, 0],
  "rotate": [0, 10, 0],
  "scale": [1, 1, 1]
}
```

```json
{
  "op": "merge_vertices",
  "target": "body",
  "vertices": ["mesh-1_v1", "mesh-1_v2"],
  "distance": 0.001
}
```

`merge_vertices`에서 `distance`를 생략하면 선택한 Vertex를 중심점으로 합칩니다. 지정하면 거리 안에 있는 Vertex만 병합합니다.

## 13. 기존 GLB 수정 절차

먼저 구조를 확인합니다.

```powershell
lowpoly inspect input/source.glb --json
```

출력의 Object 이름 또는 ID를 사용해 edit recipe를 작성합니다.

```json
{
  "version": 1,
  "name": "source-fixed",
  "metadata": { "forward": "+Z", "groundY": 0 },
  "steps": [
    { "op": "rename", "target": "mesh-2", "name": "main-body" },
    { "op": "delete", "target": "unused-part" },
    { "op": "material", "target": "main-body", "color": "#d4b483" },
    { "op": "transform", "target": "main-body", "translate": [0, 0.1, 0] },
    { "op": "ground", "y": 0 }
  ]
}
```

수정하고 검증합니다.

```powershell
lowpoly edit input/source.glb recipes/source-fixed.recipe.json --out output/source-fixed.glb
lowpoly validate output/source-fixed.glb
lowpoly inspect output/source-fixed.glb --json
```

GLB의 삼각분할 때문에 복제된 hard-normal Vertex는 import 시 정확히 같은 위치끼리 결합됩니다. 같은 재질의 공면 삼각형도 다시 편집 가능한 저폴리 폴리곤으로 복원됩니다.

## 14. Validation 메시지

| 코드 | 의미 | 일반적인 조치 |
| --- | --- | --- |
| `empty-scene` | 보이는 Mesh가 없음 | Primitive 추가 또는 삭제 Step 확인 |
| `empty-mesh` | Mesh에 Face가 없음 | Face 삭제 범위 확인 |
| `invalid-face` | 퇴화 또는 잘못된 Face | 편집 Step과 선택 ID 확인 |
| `missing-material` | Face의 Material 참조가 없음 | Join/Edit 과정과 Material 확인 |
| `missing-parent` | Parent ID가 없음 | Parent/Delete 순서 확인 |
| `non-unit-scale` | 노드 scale이 unit이 아님 | Build/Edit를 통해 scale bake |
| `textures-present` | Texture/Image payload 포함 | 텍스처를 제거한 GLB 사용 |
| `orientation-unconfirmed` | `+Z` 정면 확인 없음 | metadata에 `forward: "+Z"` 추가 |
| `not-grounded` | Bounds 최저 Y가 Ground와 다름 | `ground` Step 추가 |
| `missing-shade-pivot` | `shade_pivot` 없음 | 회전 Pivot이 필요하면 Group 추가 |

`missing-shade-pivot`은 info입니다. 모든 에셋에 Pivot이 필요한 것은 아닙니다.

## 15. 자주 발생하는 오류

### `Invalid recipe`

필드 오타, 잘못된 색상, 범위를 벗어난 subdivisions/segments, 지원하지 않는 Step이 원인입니다.

```powershell
lowpoly schema --out output/current-schema.json
```

Schema와 [examples](examples) 폴더를 비교하세요.

### `Object "..." was not found`

Step 실행 순서상 아직 생성되지 않았거나, import된 이름이 예상과 다릅니다. `inspect --json`에서 정확한 이름 또는 ID를 확인하세요.

### `Object name "..." is ambiguous`

동일한 이름이 여러 개 있습니다. 이름 대신 Object ID를 사용하세요.

### Boolean 실패

Target 또는 Cutter가 닫힌 메시인지 확인합니다. 먼저 단순 Primitive로 Boolean을 시험하고, 필요하면 `weld` 후 다시 실행하세요.

### Ground warning

모든 부품을 `shade_pivot` 아래에 두고 마지막 Step에서 다음을 실행하는 방식이 안전합니다.

```json
{ "op": "ground", "target": "shade_pivot", "y": 0 }
```

### Texture 입력 오류

현재 CLI는 texture/image payload가 포함된 GLB를 의도적으로 거부합니다. 이 프로젝트는 단색 Material 기반 에셋만 대상으로 합니다.

## 16. 제공 예제

```powershell
lowpoly build examples/wall.recipe.json --out output/wall.glb
lowpoly build examples/faceted-orb.recipe.json --out output/faceted-orb.glb
lowpoly build examples/candy-cane.recipe.json --out output/candy-cane.glb
lowpoly build examples/fountain.recipe.json --out output/fountain.glb
lowpoly build examples/boolean-cut.recipe.json --out output/boolean-cut.glb
```

벽 수정 예제:

```powershell
lowpoly edit output/wall.glb examples/edit-wall.recipe.json --out output/wall-edited.glb
```

## 17. 개발자용 검증

전체 검사:

```powershell
npm run check
```

개별 실행:

```powershell
npm run typecheck
npm run build
npm test
```

Recipe schema를 변경했다면 빌드 후 디스크 사본을 다시 생성합니다.

```powershell
npm run build
node dist/cli.js schema --out schemas/recipe.schema.json
```

새 기능에는 단위 테스트와 GLB export/reopen 통합 테스트를 함께 추가해야 합니다.
