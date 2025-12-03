---
title: Playwright로 실행한 브라우저에서 구글 자동 로그인 구현
date: 2025-12-03 09:16:59 +0900
categories: [개발]
tags: [개발]
---


지식 베이스 자동 업데이트 도구가 동작하기 위해서는 구글 AI 스튜디오 창이 열려야 한다.

그리고 구글 AI 스튜디오를 사용하려면 구글 로그인이 필요하다.

첫 번째로 접한 난관은 Playwright로 실행한 브라우저의 로그인을 구글이 거부하는 현상이었다.

아래처럼 사용하면 구글 로그인이 되지 않는다.

``` js
const browser = await chromium.launch({
  headless: false,
});
```

인터넷을 찾아보니 [비슷한 시도를 해보던 글](https://velog.io/@dudgks182/Playwright-JavaScript-Google-%EB%A1%9C%EA%B7%B8%EC%9D%B8-%EC%9E%90%EB%8F%99%ED%99%94-%ED%85%8C%EC%8A%A4%ED%8A%B8)이 있었다.

위 링크에서 아래와 같은 옵션을 넣어야 구글이 로그인을 허용한다.

```js
const browser = await chromium.launch({
  headless: false,
  args: ["--disable-blink-features=AutomationControlled"],
});
```

문제는 위 링크처럼 `session.json` 에 로그인 정보를 저장하는 방식은 동작하지 않는다.

LLM들이 추천한 방법으로 `launchPersistentContext` 을 사용하는 방법이 있는데 한 번 사용해보자.

```js
const browser = await chromium.launchPersistentContext("./user_data", {
  headless: false,
  args: ["--disable-blink-features=AutomationControlled"],
});
```

이렇게 한 뒤 gitignore에 user_data를 넣고 사용했더니 처음 몇 번 정도 로그인을 요구하다가 어느 시점부터 자동 로그인이 성공해서 더 이상 로그인을 요구하지 않게 되었다.

Ctrl+C로 스크립트를 강제 종료했을 때는 재로그인을 요구했는데, 브라우저 창을 닫는 식으로 종료하니 재로그인을 요구하지 않은 것 같은데 어떻게 된 일인지 영문을 모르겠다.

그 외에는 about:blank 로 탭이 하나 뜨는 현상이 있는데 `launchPersistentContext` 는 사용자가 브라우저를 실행하듯이 작동하는 방식이라 원래 그렇다는 듯.

빈 탭이 하나 뜨는 문제는 아래와 같이 초기에 뜨는 빈 탭 하나를 앞으로 사용하게 하는 방식으로 해결.

```js
const pages = browser.pages();
const page = pages.length > 0 ? pages[0] : await browser.newPage();
```

오늘 구현한 부분들이 앞으로 잘 작동해서 이 글을 수정할 일이 없으면 좋겠다.
