---
title: exec과 spawn의 차이점
date: 2025-12-08 15:49:22 +0900
categories: [개발]
tags: [개발]
---


아래와 같은 코드를 작성해서 사용하려다가 올바르게 작동하지 않았다.

자식 프로세스가 실행되었을 때 내부에서 inquirer의 상호작용이 불가능한 현상의 원인이 무엇일까?

```js
const inquirer = require("inquirer");
const { exec } = require("child_process");

const choices = [
  { name: "배포하기 (npm run deploy)", value: "npm run deploy" },
  { name: "로그 다운로드 (node log.js)", value: "node log.js" },
  { name: "로그 일괄 다운로드 (node download.js)", value: "node download.js" },
  { name: "지식 베이스 파일 생성 (node KB.js)", value: "node KB.js" },
  { name: "지식 베이스 업데이트 (node update.js)", value: "node update.js" },
];

inquirer
  .createPromptModule()([
    {
      type: "list",
      name: "command",
      message: "어떤 작업을 실행할까요?",
      choices,
    },
  ])
  .then(({ command }) => {
    console.log(`▶ 명령 실행: ${command}`);
    const child = exec(command);

    child.stdout.on("data", (data) => console.log(data));
    child.stderr.on("data", (data) => console.error(data));
    child.on("close", (code) => console.log(`종료 코드: ${code}`));
  })
  .catch(console.error);
```

이 코드를 그대로 제미니 3에 던져서 물어본 결과...

```md
### 1. 원인 분석

1.  **STDIN(표준 입력) 단절**:
    *   `exec` 함수는 기본적으로 자식 프로세스의 **표준 입력(stdin)**을 부모 프로세스와 연결하지 않습니다.
    *   `KB.js` 내부의 `inquirer`는 사용자의 키보드 입력(stdin)을 기다리는데, `exec`로 실행된 프로세스는 키보드 입력을 받을 수 있는 통로가 끊겨 있는 상태입니다. 따라서 프롬프트가 떠도 입력을 할 수 없거나 무한 대기 상태에 빠집니다.
2.  **비대화형(Non-interactive) 모드**:
    *   `exec`는 주로 명령어를 실행하고 그 결과(stdout buffer)를 한 번에 받아오는 데 최적화되어 있습니다. 실시간 상호작용(Interactive TTY)이 필요한 `inquirer` 같은 라이브러리와는 맞지 않습니다.

### 2. 해결 방법: `spawn` 사용 및 `stdio: 'inherit'` 설정

이 문제를 해결하려면 `exec` 대신 **`spawn`**을 사용해야 하며, **`stdio: 'inherit'`** 옵션을 주어야 합니다. 이 옵션은 부모 프로세스(현재 실행 중인 스크립트)의 입력/출력을 자식 프로세스(`KB.js`)와 **그대로 공유**하게 만듭니다.
```

`exec` 대신 `spawn`을 사용하게끔 아래와 같이 코드를 수정해주었다.

```js
const inquirer = require("inquirer");
const { spawn } = require("child_process");

const choices = [
  { name: "배포하기 (npm run deploy)", value: "npm run deploy" },
  { name: "로그 다운로드 (node log.js)", value: "node log.js" },
  { name: "로그 일괄 다운로드 (node download.js)", value: "node download.js" },
  { name: "지식 베이스 파일 생성 (node KB.js)", value: "node KB.js" },
  { name: "지식 베이스 업데이트 (node update.js)", value: "node update.js" },
];

inquirer
  .createPromptModule()([
    {
      type: "list",
      name: "command",
      message: "어떤 작업을 실행할까요?",
      choices,
    },
  ])
  .then(({ command }) => {
    console.log(`▶ 명령 실행: ${command}`);

    const args = command.split(" ");
    const cmd = args.shift();

    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: true,
    });

    child.on("close", (code) => {
      console.log(`\n종료 코드: ${code}`);
    });
  })
  .catch(console.error);
```

그럼 `exec`는 언제 사용하기 위해 존재하는 함수인지 궁금해서 물어보았다.

~~~md
`spawn`이 훨씬 강력하고 유연해 보이지만, **`exec`가 존재하는 이유는 "편의성(Simplicity)"과 "목적의 차이"** 때문입니다.

사실 Node.js 내부적으로 보면 **`exec`는 `spawn`을 사용하기 쉽게 감싸놓은(Wrapper) 함수**일 뿐입니다. 하지만 개발자가 코드를 짤 때 상황에 따라 `exec`가 훨씬 효율적일 때가 많습니다.

그 이유를 3가지 핵심 차이점으로 정리해 드립니다.

---

### 1. 결과값 처리 방식 (한 방에 받기 vs 실시간 받기)

가장 큰 차이는 **"결과를 언제, 어떻게 주느냐"**입니다.

*   **`exec` (버퍼링 방식):**
    *   명령어가 **완전히 끝날 때까지 기다렸다가**, 결과를 **한 번에(메모리에 담아서)** 콜백 함수로 줍니다.
    *   **용도:** 결과 텍스트가 짧고, 단순히 그 결과값만 필요한 경우.
    *   **예시:** "현재 git 브랜치 이름 가져오기", "파일 목록 개수 세기"

    ```javascript
    // exec: 코드가 매우 짧고 직관적임
    exec('git rev-parse --abbrev-ref HEAD', (err, stdout) => {
      console.log('현재 브랜치:', stdout); // 결과가 한 번에 텍스트로 옴
    });
    ```

*   **`spawn` (스트리밍 방식):**
    *   명령어가 실행되는 **도중에** 데이터가 나올 때마다 조각조각(Chunk) 줍니다.
    *   **용도:** 데이터 양이 엄청나게 많거나, 실행 시간이 길거나(서버 구동), **사용자와 상호작용(inquirer)**이 필요한 경우.

### 2. 코드 복잡도 (간결함 vs 정교함)

`spawn`으로 `exec`와 똑같은 기능을 구현하려면 코드가 훨씬 길어집니다.

**`exec`를 쓸 때:**
```javascript
// 그냥 명령어와 콜백만 넣으면 끝
exec('ls -al', (error, stdout, stderr) => {
    console.log(stdout);
});
```

**`spawn`으로 똑같이 하려면:**
```javascript
// 데이터를 모으는 변수도 만들어야 하고, 이벤트 리스너도 달아야 함
const child = spawn('ls', ['-al']);
let result = '';

child.stdout.on('data', (data) => {
    result += data.toString(); // 조각난 데이터를 직접 합쳐야 함
});

child.on('close', () => {
    console.log(result); // 다 끝나야 비로소 사용 가능
});
```
단순히 결과만 조회하고 싶을 때 `spawn`을 쓰면 불필요하게 코드가 복잡해집니다.

### 3. 쉘 명령어 지원 (파이프라인 등)

*   **`exec`:** 기본적으로 **쉘(Shell) 안에서 실행**됩니다. 그래서 파이프(`|`), 리다이렉션(`>`), 논리 연산자(`&&`) 같은 쉘 문법을 바로 쓸 수 있습니다.
    *   예: `exec("cat *.js | grep 'test' > result.txt")` -> **가능**
*   **`spawn`:** 기본적으로는 실행 파일 하나만 딱 실행합니다. 파이프라인 등을 쓰려면 `shell: true` 옵션을 켜거나 코드로 직접 연결해줘야 해서 번거롭습니다.

---

### 요약: 언제 무엇을 써야 할까?

| 구분          | `exec`                                                | `spawn`                                                |
| :------------ | :---------------------------------------------------- | :----------------------------------------------------- |
| **핵심 방식** | **버퍼링** (끝나면 한 번에 줌)                        | **스트리밍** (실시간으로 줌)                           |
| **메모리**    | 결과가 크면 **메모리 초과 에러** 발생 (기본 1MB 내외) | 메모리 적게 먹음 (계속 흘려보냄)                       |
| **코드 길이** | 짧고 간단함 (콜백 1개)                                | 김 (이벤트 리스너 등록 필요)                           |
| **상호작용**  | 불가능 (입력 못 받음)                                 | **가능** (stdio: 'inherit' 등)                         |
| **추천 상황** | `git status` 확인, 간단한 파일 읽기, 버전 체크        | `npm install`, 서버 실행, 비디오 인코딩, **대화형 툴** |

**결론적으로:**
작성하신 `KB.js` 처럼 **사용자와 대화(키 입력)를 하거나 로그를 실시간으로 봐야 하는 경우**에는 `exec`가 부적합했기에 `spawn`을 써야 했던 것이고, 단순히 **"버전 정보 문자열만 가져와"** 같은 상황이라면 `exec`가 훨씬 편한 선택입니다.
~~~

대략 이런 차이가 있다고 한다.

둘을 비교하는 것을 넘어 둘 중 어떤 걸 써야 하는지도 AI한테 맡길 수 있다니 굉장한걸.
